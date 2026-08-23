// @ts-nocheck
import { fetch, Request, Script, Widget, VStack, HStack, Text, Spacer, Image, Label, Storage, modifiers } from "scripting";

(async () => {
// UfiPeek v3.0 (LowRisk) 
// zreq自动完成ZTE登录，公网直连可用，无需连内网WiFi
// 原理：UFI-TOOLS反代从设备本机(127.0.0.1)向ZTE后端发请求
//       zreq在本机执行时自动处理LD获取+SHA256哈希+POST登录全流程
// Fallback：zreq失败则回退GET-only goform + POST登录
//
// 流程：
// 1. GET /api/baseDeviceInfo -> DeviceInfo
// 2. POST /api/user_shell -> zreq GET basic (用zte_password登录)
// 3. POST /api/root_shell -> WiFi freq + meminfo (root权限)

var hexChr = ["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"];

var DEVICE_PATH = "/api/baseDeviceInfo";
var SHELL_PATH = "/api/user_shell";
var ROOT_SHELL_PATH = "/api/root_shell";
var GOFORM_GET_PATH = "/api/goform/goform_get_cmd_process";
var GOFORM_SET_PATH = "/api/goform/goform_set_cmd_process";

var KANO_URL = trimSlash(readSetting("URL", "http://192.168.0.1:2333"));
var UFI_PASSWORD = readSetting("password", ""); // 密码请在脚本参数或 Storage 中配置
var ZTE_PASSWORD = readSetting("zte_password",""); // ZTE 后台密码请在脚本参数或 Storage 中配置
var ZREQ_BIN = "/data/data/com.minikano.f50_sms/files/zreq";

var DeviceInfo = {};
var state = {};
var GoformBasic = {};
var zreqUsed = false;
var WifiFreq = 0;
var MemInfo = {};
var isTransparent = Widget.isTransparentBackground || Widget.isTransparentMode || Widget.isBlurMode;
var isDarkMode = false;
try { isDarkMode = Device.colorScheme === "dark"; } catch (e) {}
var widgetBg = isTransparent ? "clear" : "systemBackground";
var pillBg = isTransparent ? (isDarkMode ? "rgba(28,28,30,0.5)" : "rgba(242,242,247,0.5)") : "secondarySystemBackground";

// === Step 1: DeviceInfo ===
try {
  DeviceInfo = await getOfficialJSON(DEVICE_PATH);
  console.log("v3.0 DeviceInfo: OK");
} catch (e) {
  console.log("v3.0 DeviceInfo fail:", String(e));
}

// === Step 2: zreq获取goform basic (自动登录) ===
try {
  var basicCmd = buildZreqGetCmd(getBasicFields());
  console.log("v3.0 zreq cmd:", basicCmd);
  var basicShell = await postShell(basicCmd);
  if (basicShell && basicShell.done && basicShell.content) {
    GoformBasic = JSON.parse(basicShell.content);
    zreqUsed = true;

    console.log("v3.0 zreq: OK loginfo=" + String(GoformBasic.loginfo));
    // 单独查询 network_information 补充 RSRQ/SNR（批量请求不返回质量字段）
    try {
      var netInfo = await getGoform(["network_information"]);
      if (netInfo && typeof netInfo === "object") {
        for (var nk in netInfo) {
          var nv = netInfo[nk];
          var cur = GoformBasic[nk];
          if (nv !== undefined && nv !== null && nv !== "" && (cur === undefined || cur === null || cur === "")) GoformBasic[nk] = nv;
        }
      }
    } catch (nie) { console.log("v3.0 netinfo query fail:", String(nie)); }
  } else {
    console.log("v3.0 zreq: no data");
  }
} catch (e) {
  console.log("v3.0 zreq fail:", String(e));
}

// === Step 2b: Fallback to direct GET goform ===
if (!zreqUsed) {
  console.log("v3.0 fallback: direct GET goform basic");
  try {
    GoformBasic = await getGoform(getBasicFields());
    console.log("v3.0 GET basic: loginfo=" + String(GoformBasic.loginfo));
    // Debug: print all available fields
    var allFields = Object.keys(GoformBasic).sort();
    console.log("v3.0 GET fields:", JSON.stringify(allFields));
    if ("Nr_bands" in GoformBasic) {
      console.log("v3.0 GET Nr_bands:", String(GoformBasic.Nr_bands));
    } else {
      console.log("v3.0 GET: Nr_bands NOT FOUND");
    }
  } catch (e2) {
    console.log("v3.0 GET fail:", String(e2));
  }

  // v3.0兼容：如果loginfo=no且GET-only，尝试POST登录
  if (String(GoformBasic.loginfo) === "no") {
    try {
      await loginZTE();
      GoformBasic = await getGoform(getBasicFields());
      console.log("v3.0 after POST login: loginfo=" + String(GoformBasic.loginfo));
    } catch (le) {
      console.log("v3.0 POST login fail:", String(le));
    }
  }
}

// === Step 5: root_shell WiFi freq + meminfo ===
try {
  var sysCmd = "dumpsys wifi 2>/dev/null | grep -o 'frequency= [0-9]*' | head -1; grep -E 'MemTotal|MemAvailable' /proc/meminfo";
  var sysResult = await postShell(sysCmd, ROOT_SHELL_PATH);
  if (sysResult) {
    var sysStr = String(sysResult);
    var freqMatch = sysStr.match(/frequency=\s*(\d+)/);
    if (freqMatch) WifiFreq = parseInt(freqMatch[1], 10);
    var memTotalM = sysStr.match(/MemTotal:\s*(\d+)/);
    var memAvailM = sysStr.match(/MemAvailable:\s*(\d+)/);
    if (memTotalM) MemInfo.total = parseInt(memTotalM[1], 10);
    if (memAvailM) MemInfo.available = parseInt(memAvailM[1], 10);
  }
  console.log("v3.0 root_shell: freq=" + WifiFreq + " mem=" + JSON.stringify(MemInfo));
} catch (e6) {
  console.log("v3.0 root_shell fail:", String(e6));
}

// === Merge goform data ===
var GoformData = {};
for (var k in GoformBasic) { if (Object.prototype.hasOwnProperty.call(GoformBasic, k)) GoformData[k] = GoformBasic[k]; }

bindStableData(state, DeviceInfo, GoformData);

state.update_time = makeUpdateTime();
state.status_font = 8.5;

// WiFi band (5G/2.4G)
state.wifi_band_text = WifiFreq > 0 ? (WifiFreq >= 4000 ? "5G" : "2.4G") : "--";

// NR/LTE band display
var nrBandsRaw = pickRaw(GoformData.Nr_bands);
var lteBandsRaw = pickRaw(GoformData.Lte_bands);
state.band_text = /^[0-9]+$/.test(nrBandsRaw) ? "N" + nrBandsRaw : (/^[0-9]+$/.test(lteBandsRaw) ? "B" + lteBandsRaw : "—");
console.log("v3.0 band_text:", state.band_text, "nrBands:", nrBandsRaw);

// Memory percentage
var memUsedKb = (MemInfo.total > 0 && MemInfo.available >= 0) ? MemInfo.total - MemInfo.available : 0;
state.mem_text = MemInfo.total > 0 ? Math.round(memUsedKb / MemInfo.total * 100) + "%" : "--";
state.status_font = 8.5;

// === Dark mode ===
var isDark = false;
try { isDark = false; } catch(e) {}
state.clr_glass_bg  = isDark ? "1A1A2E96" : "FFFFFF96";
state.clr_primary   = isDark ? "F1F5F9"   : "172033";

console.log("v3.0 Final:", JSON.stringify({
  model: state.model_name, ufi: state.ufi_ver, temp: state.cputemp, cpu: state.cpuusage,
  battery: state.battery, batIcon: state.battery_icon, batIconColor: state.battery_icon_color,
  net: state.net_summary, signalbar: state.signalbar, rsrp: state.rsrp_text, rsrq: state.rsrq_text, snr: state.snr_text,
  ssid: state.ssid_text, sms_unread: state.sms_unread_text, smsIconColor: state.sms_icon_color, wifi_count: state.wifi_device_count, dailyValue: state.daily_data_value, dailyUnit: state.daily_data_unit, monthlyValue: state.monthly_data_value, monthlyUnit: state.monthly_data_unit,
  loginfo: String(GoformData.loginfo || ""), zreq: zreqUsed ? "OK" : "FAIL",
  wifiBand: state.wifi_band_text, band: state.band_text, mem: state.mem_text,
  isDark: isDark, update: state.update_time
}));

// ===================== Field groups =====================
function getBasicFields() {
  return [
    "model_name","network_provider","network_type","network_signalbar",
    "battery_value","battery_vol_percent","battery_charging","ppp_status",
    "network_information","Lte_ca_status","loginfo","Z5g_rsrp","nr_rsrp","nr_rssi","nr_rsrq","Nr_rsrq","nr_snr","Nr_snr","nr5g_rsrq","nr5g_snr","lte_rsrq","lte_snr","sms_unread_num","SSID1","RadioOff","station_list",
    "LD","RD","modem_main_state","pin_status","sim_pin_status"
  ];
}

function applyHeaders(req, values) {
  for (var key in values) {
    if (Object.prototype.hasOwnProperty.call(values, key)) req.headers.set(key, String(values[key]));
  }
}

// ===================== Shell POST (zreq/root) =====================
async function readJSONResponse(resp, label) {
  var status = resp && resp.status;
  var raw = await resp.text();
  if (!raw || !raw.trim()) throw new Error(label + " HTTP " + String(status) + " empty response");
  try { return JSON.parse(raw); } catch (e) { throw new Error(label + " HTTP " + String(status) + " invalid JSON: " + raw.slice(0, 120)); }
}

async function postShell(command, rootPath) {
  var path = rootPath || SHELL_PATH;
  var req = new Request(KANO_URL + path);
  req.allowInsecureRequest = true;
  req.method = "POST";
  applyHeaders(req, buildKanoHeaders("POST", path));
  req.headers.set("Content-Type", "application/json");
  req.body = JSON.stringify({ command: command });
  req.timeout = 15;
  req.allowInsecureRequest = true;
  var resp = await fetch(req);
  var parsed = await readJSONResponse(resp, "POST " + path);
  return parsed && parsed.result;
}

function buildZreqGetCmd(cmdList) {
  var params = "cmd=" + cmdList.join(",") + "&multi_data=1&isTest=false";
  return ZREQ_BIN + " -pwd " + shellQuote(ZTE_PASSWORD)
    + " -method GET"
    + " -params " + shellQuote(params)
    + " -json";
}

function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

// ===================== ZTE login (fallback) =====================
async function loginZTE() {
  var ldUrl = KANO_URL + GOFORM_GET_PATH + "?multi_data=1&isTest=false&cmd=LD&_=" + Date.now();
  var ldReq = new Request(ldUrl);
  ldReq.allowInsecureRequest = true;
  ldReq.method = "GET";
  applyHeaders(ldReq, buildKanoHeaders("GET", GOFORM_GET_PATH));
  var ldResp = await (await fetch(ldReq)).json();
  var ld = ldResp && ldResp.LD;
  if (!ld) throw new Error("no LD");

  var pwdHash = sha256HexFromString(ZTE_PASSWORD).toUpperCase();
  var loginHash = sha256HexFromString(pwdHash + ld).toUpperCase();

  var loginUrl = KANO_URL + GOFORM_SET_PATH;
  var loginReq = new Request(loginUrl);
  loginReq.allowInsecureRequest = true;
  loginReq.method = "POST";
  var postHeaders = buildKanoHeaders("POST", GOFORM_SET_PATH);
  loginReq.headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
  applyHeaders(loginReq, buildKanoHeaders("POST", GOFORM_SET_PATH));
  loginReq.body = "goformId=LOGIN&isTest=false&user=admin&password=" + loginHash;

  var loginRaw = await (await fetch(loginReq)).text();
  console.log("v3.0 LOGIN raw:", String(loginRaw).substring(0, 100));

  if (loginRaw && loginRaw.indexOf('"result":0') >= 0) return;
  var verifyUrl = KANO_URL + GOFORM_GET_PATH + "?multi_data=1&isTest=false&cmd=loginfo&_=" + Date.now();
  var verifyReq = new Request(verifyUrl);
  verifyReq.allowInsecureRequest = true;
  verifyReq.method = "GET";
  applyHeaders(verifyReq, buildKanoHeaders("GET", GOFORM_GET_PATH));
  var verifyResp = await (await fetch(verifyReq)).json();
  if (String(verifyResp && verifyResp.loginfo) === "ok") return;
  throw new Error("login failed: loginfo=" + String(verifyResp && verifyResp.loginfo));
}

// ===================== Request functions =====================
async function getOfficialJSON(path) {
  var req = new Request(KANO_URL + path);
  req.allowInsecureRequest = true;
  req.method = "GET";
  applyHeaders(req, buildKanoHeaders("GET", path));
  return await readJSONResponse(await fetch(req), "request");
}

async function getGoform(cmdList) {
  var cmd = cmdList.join(",");
  var url = KANO_URL + GOFORM_GET_PATH + "?multi_data=1&isTest=false&cmd=" + cmd + "&_=" + Date.now();
  var req = new Request(url);
  req.allowInsecureRequest = true;
  req.method = "GET";
  applyHeaders(req, buildKanoHeaders("GET", GOFORM_GET_PATH));
  return await readJSONResponse(await fetch(req), "request");
}

// ===================== Data binding =====================
function bindStableData(ctx, d, g) {
  d = d || {}; g = g || {};

  ctx.model_name = pick(d.model, g.model_name);
  ctx.ufi_ver = buildUfiVersion(d);

  var temp = normalizeTemp(d.cpu_temp);
  if (!isNum(temp)) temp = normalizeTemp(maxTemp(d.cpu_temp_list));
  ctx.cputemp = isNum(temp) ? roundText(temp, 1) : "--";

  var cpu = toNum(d.cpu_usage);
  ctx.cpuusage = isNum(cpu) ? roundText(cpu, 0) : "--";

  ctx.battery = pick(d.battery, g.battery_value, g.battery_vol_percent);

  // Battery icon + color based on level and charging
  var batVal = toNum(ctx.battery);
  var isCharging = String(g.battery_charging) === "1";
  if (isCharging) {
    ctx.battery_icon = "battery.100percent.bolt";
    ctx.battery_icon_color = "16A34A";
  } else if (!isNum(batVal) || batVal <= 0) {
    ctx.battery_icon = "battery.0percent";
    ctx.battery_icon_color = "F59E0B";
  } else if (batVal <= 25) {
    ctx.battery_icon = "battery.25percent";
    ctx.battery_icon_color = "DC2626";
  } else if (batVal <= 50) {
    ctx.battery_icon = "battery.50percent";
    ctx.battery_icon_color = "0056D6";
  } else if (batVal <= 75) {
    ctx.battery_icon = "battery.75percent";
    ctx.battery_icon_color = "F59E0B";
  } else {
    ctx.battery_icon = "battery.100percent";
    ctx.battery_icon_color = "16A34A";
  }

  var provider = pick(g.network_provider);
  var netType = normNetType(g.network_type);
  ctx.net_summary = provider === "--" && netType === "--" ? "-- --" : provider + " " + netType;
  ctx.signalbar = pick(g.network_signalbar, g.signalbar, g.network_signal_bar, d.signalbar, d.signal_bars, "--");
  var signalNumeric = toNum(ctx.signalbar);
  if (ctx.signalbar !== "--" && isNum(signalNumeric) && signalNumeric < 0) ctx.signalbar = signalBarsFromDbm(signalNumeric);
  if (ctx.signalbar === "--") {
    var signalDbm = toNum(pickRaw(g.nr_rsrp, g.Z5g_rsrp, g.nr_rssi));
    if (isNum(signalDbm)) ctx.signalbar = signalBarsFromDbm(signalDbm);
  }
  ctx.rsrp_text = formatRsrp(pickRaw(g.Z5g_rsrp, g.nr_rsrp, g.nr_rssi));
  ctx.rsrq_text = formatMetric(pickRaw(g.nr_rsrq, g.Nr_rsrq, g.nr5g_rsrq, g.lte_rsrq));
  ctx.snr_text = formatMetric(pickRaw(g.Nr_snr, g.nr_snr, g.nr5g_snr, g.lte_snr));

  ctx.ssid_text = pick(g.SSID1);
  var unreadNum = parseInt(pickRaw(g.sms_unread_num), 10) || 0;
  ctx.sms_unread_text = unreadNum > 0 ? String(unreadNum) : "0";
  ctx.sms_icon_color = unreadNum > 0 ? "DC2626" : "0056D6";

  var dailyParts = splitByteText(formatBytes(d.daily_data));
  ctx.daily_data_value = dailyParts.value;
  ctx.daily_data_unit = dailyParts.unit;
  var monthlyParts = splitByteText(formatBytes(d.monthly_data));
  ctx.monthly_data_value = monthlyParts.value;
  ctx.monthly_data_unit = monthlyParts.unit;

  var staList = g.station_list;
  var wifiCount = 0;
  if (typeof staList === "string" && staList.trim() !== "") {
    try { staList = JSON.parse(staList); } catch(e) {}
  }
  if (Array.isArray(staList)) {
    wifiCount = staList.length;
  } else if (staList && typeof staList === "object") {
    wifiCount = Object.keys(staList).length;
  }
  // Band info (5G/4G)
  var nrBands = pickRaw(g.Nr_bands);
  var lteBands = pickRaw(g.Lte_bands);
  var bandText = "—";
  // Validate: only accept numeric band values (e.g. "41", "1", "78")
  if (/^[0-9]+$/.test(nrBands)) {
    bandText = "N" + nrBands;
  } else if (/^[0-9]+$/.test(lteBands)) {
    bandText = "B" + lteBands;
  }
  ctx.band_text = bandText;
  ctx.wifi_device_count = wifiCount > 0 ? String(wifiCount) : "0";
}

function formatMetric(v) {
  var n = toNum(v);
  return isNum(n) ? String(n) : "--";
}

function signalBarsFromDbm(dbm) {
  if (dbm >= -85) return "4";
  if (dbm >= -95) return "3";
  if (dbm >= -105) return "2";
  if (dbm >= -115) return "1";
  return "0";
}

function buildUfiVersion(d) {
  var app = pickRaw(d.app_ver);
  var code = pickRaw(d.app_ver_code);
  if (app && code) return String(app) + "." + String(code);
  if (app) return String(app);
  if (code) return String(code);
  return "--";
}

function formatRsrp(v) {
  var n = toNum(v);
  if (!isNum(n)) return "--";
  return roundText(n, 0) + "dBm";
}

function makeUpdateTime() {
  var d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}
function pad2(n) { n = Number(n); return n < 10 ? "0" + n : String(n); }

// ===================== Utils =====================
function readSetting(key, fallback) {
  try {
    var params = Script.queryParameters || {};
    var widgetParams = Widget.parameter;
    if (widgetParams) {
      if (typeof widgetParams === "object") params = Object.assign({}, params, widgetParams);
      else { try { params = Object.assign({}, params, JSON.parse(widgetParams)); } catch (e0) {} }
    }
    var v = params[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  } catch (e) {}
  try {
    var saved = Storage.get("UfiPeek." + key);
    if (saved !== undefined && saved !== null && String(saved).trim() !== "") return String(saved).trim();
  } catch (e3) {}
  if (key === "password") {
    try { var old = (Script.queryParameters || {})["pw"]; if (old !== undefined && old !== null && String(old).trim() !== "") return String(old).trim(); } catch (e2) {}
  }
  return fallback || "";
}
function trimSlash(s) { return String(s || "").replace(/\/+$/, ""); }
function pickRaw() {
  for (var i = 0; i < arguments.length; i++) {
    var v = arguments[i];
    if (v !== undefined && v !== null && v !== "" && v !== "--") return v;
  }
  return null;
}
function pick() {
  var v = pickRaw.apply(null, arguments);
  return v === null ? "--" : String(v);
}
function toNum(v) {
  if (v === undefined || v === null || v === "") return NaN;
  var n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : NaN;
}
function isNum(n) { return isFinite(Number(n)); }
function roundText(n, d) { return Number(n).toFixed(d).replace(/\.0+$/, ""); }
function normalizeTemp(v) { var n = toNum(v); if (!isNum(n)) return NaN; return n > 1000 ? n / 1000 : n; }
function maxTemp(list) {
  if (!Array.isArray(list)) return null;
  var m = null;
  for (var i = 0; i < list.length; i++) {
    var n = toNum(list[i] && list[i].temp);
    if (isNum(n) && n > 0 && (m === null || n > m)) m = n;
  }
  return m;
}
function normNetType(v) {
  var s = String(v === undefined || v === null ? "--" : v);
  if (s === "20" || s === "5G") return "5G";
  if (s === "LTE-NSA") return "5G";
  if (s === "13" || s === "LTE") return "4G";
  if (s === "2" || s === "WCDMA" || s === "3G") return "3G";
  if (s === "1" || s === "GSM" || s === "2G") return "2G";
  return s;
}
function formatBytes(b) {
  var n = toNum(b);
  if (!isNum(n) || n <= 0) return "--";
  var gb = n / 1073741824;
  if (gb >= 1) return gb.toFixed(gb >= 10 ? 1 : 2).replace(/\.0$/, "") + "GB";
  var mb = n / 1048576;
  return mb.toFixed(mb >= 10 ? 0 : 1).replace(/\.0$/, "") + "MB";
}
function splitByteText(s) {
  s = String(s === undefined || s === null ? "--" : s);
  if (s === "--" || s === "") return { value: "--", unit: "" };
  var m = s.match(/^([0-9.]+)([A-Za-z]+)$/);
  if (m) return { value: m[1], unit: m[2] };
  return { value: s, unit: "" };
}

// ===================== UFI-TOOLS sign / SHA256 / HMAC-MD5 =====================
function buildKanoHeaders(method, path) {
  var t = String(Date.now());
  var auth = sha256HexFromString(UFI_PASSWORD).toLowerCase();
  var sign = buildKanoSign(method, path, t);
  return { "Authorization": auth, "kano-t": t, "kano-sign": sign };
}
function buildKanoSign(method, path, timestamp) {
  var secretKey = "minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd";
  var rawData = "minikano" + String(method || "GET").toUpperCase() + String(path || "") + String(timestamp);
  var hmacHex = hmacMd5(rawData, secretKey);
  var hmacBytes = hexToBytes(hmacHex);
  var mid = Math.floor(hmacBytes.length / 2);
  var part1 = hmacBytes.slice(0, mid);
  var part2 = hmacBytes.slice(mid);
  var sha1Bytes = sha256Bytes(part1);
  var sha2Bytes = sha256Bytes(part2);
  var finalBytes = sha256Bytes(sha1Bytes.concat(sha2Bytes));
  return bytesToHex(finalBytes).toLowerCase();
}
function utf8Bytes(str) {
  var s = String(str);
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) { out.push(0xc0 | (c >> 6)); out.push(0x80 | (c & 0x3f)); }
    else if (c >= 0xd800 && c <= 0xdbff) {
      i++;
      var c2 = s.charCodeAt(i);
      var code = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      out.push(0xf0 | (code >> 18)); out.push(0x80 | ((code >> 12) & 0x3f)); out.push(0x80 | ((code >> 6) & 0x3f)); out.push(0x80 | (code & 0x3f));
    } else { out.push(0xe0 | (c >> 12)); out.push(0x80 | ((c >> 6) & 0x3f)); out.push(0x80 | (c & 0x3f)); }
  }
  return out;
}
function byteHex(n) { n = n & 255; var s = n.toString(16); return s.length === 1 ? "0" + s : s; }
function bytesToHex(bytes) { var out = ""; for (var i = 0; i < bytes.length; i++) out += byteHex(bytes[i]); return out; }
function hexToBytes(hex) { var out = []; var s = String(hex); for (var i = 0; i < s.length; i += 2) out.push(parseInt(s.substr(i, 2), 16)); return out; }
function sha256HexFromString(str) { return bytesToHex(sha256Bytes(utf8Bytes(str))); }
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
function add32(a, b) { return (a + b) >>> 0; }
function sha256Bytes(bytes) {
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  var msg = bytes.slice();
  var bitLen = msg.length * 8;
  msg.push(0x80);
  while ((msg.length % 64) !== 56) msg.push(0);
  var high = Math.floor(bitLen / 0x100000000), low = bitLen >>> 0;
  msg.push((high>>>24)&255,(high>>>16)&255,(high>>>8)&255,high&255,(low>>>24)&255,(low>>>16)&255,(low>>>8)&255,low&255);
  for (var i=0;i<msg.length;i+=64){
    var w=new Array(64);
    for(var j=0;j<16;j++){var idx=i+j*4; w[j]=((msg[idx]<<24)|(msg[idx+1]<<16)|(msg[idx+2]<<8)|msg[idx+3])>>>0;}
    for(var jj=16;jj<64;jj++){var s0=rotr(w[jj-15],7)^rotr(w[jj-15],18)^(w[jj-15]>>>3); var s1=rotr(w[jj-2],17)^rotr(w[jj-2],19)^(w[jj-2]>>>10); w[jj]=add32(add32(add32(w[jj-16],s0),w[jj-7]),s1);}
    var a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for(var k=0;k<64;k++){var S1=rotr(e,6)^rotr(e,11)^rotr(e,25); var ch=(e&f)^((~e)&g); var t1=add32(add32(add32(add32(h,S1),ch),K[k]),w[k]); var S0=rotr(a,2)^rotr(a,13)^rotr(a,22); var maj=(a&b)^(a&c)^(b&c); var t2=add32(S0,maj); h=g; g=f; f=e; e=add32(d,t1); d=c; c=b; b=a; a=add32(t1,t2);}
    h0=add32(h0,a); h1=add32(h1,b); h2=add32(h2,c); h3=add32(h3,d); h4=add32(h4,e); h5=add32(h5,f); h6=add32(h6,g); h7=add32(h7,h);
  }
  var words=[h0,h1,h2,h3,h4,h5,h6,h7], out=[];
  for (var wi=0; wi<words.length; wi++) { var ww=words[wi]; out.push((ww>>>24)&255,(ww>>>16)&255,(ww>>>8)&255,ww&255); }
  return out;
}
function md5cycle(x,k){var a=x[0],b=x[1],c=x[2],d=x[3];a=ff(a,b,c,d,k[0],7,-680876936);d=ff(d,a,b,c,k[1],12,-389564586);c=ff(c,d,a,b,k[2],17,606105819);b=ff(b,c,d,a,k[3],22,-1044525330);a=ff(a,b,c,d,k[4],7,-176418897);d=ff(d,a,b,c,k[5],12,1200080426);c=ff(c,d,a,b,k[6],17,-1473231341);b=ff(b,c,d,a,k[7],22,-45705983);a=ff(a,b,c,d,k[8],7,1770035416);d=ff(d,a,b,c,k[9],12,-1958414417);c=ff(c,d,a,b,k[10],17,-42063);b=ff(b,c,d,a,k[11],22,-1990404162);a=ff(a,b,c,d,k[12],7,1804603682);d=ff(d,a,b,c,k[13],12,-40341101);c=ff(c,d,a,b,k[14],17,-1502002290);b=ff(b,c,d,a,k[15],22,1236535329);a=gg(a,b,c,d,k[1],5,-165796510);d=gg(d,a,b,c,k[6],9,-1069501632);c=gg(c,d,a,b,k[11],14,643717713);b=gg(b,c,d,a,k[0],20,-373897302);a=gg(a,b,c,d,k[5],5,-701558691);d=gg(d,a,b,c,k[10],9,38016083);c=gg(c,d,a,b,k[15],14,-660478335);b=gg(b,c,d,a,k[4],20,-405537848);a=gg(a,b,c,d,k[9],5,568446438);d=gg(d,a,b,c,k[14],9,-1019803690);c=gg(c,d,a,b,k[3],14,-187363961);b=gg(b,c,d,a,k[8],20,1163531501);a=gg(a,b,c,d,k[13],5,-1444681467);d=gg(d,a,b,c,k[2],9,-51403784);c=gg(c,d,a,b,k[7],14,1735328473);b=gg(b,c,d,a,k[12],20,-1926607734);a=hh(a,b,c,d,k[5],4,-378558);d=hh(d,a,b,c,k[8],11,-2022574463);c=hh(c,d,a,b,k[11],16,1839030562);b=hh(b,c,d,a,k[14],23,-35309556);a=hh(a,b,c,d,k[1],4,-1530992060);d=hh(d,a,b,c,k[4],11,1272893353);c=hh(c,d,a,b,k[7],16,-155497632);b=hh(b,c,d,a,k[10],23,-1094730640);a=hh(a,b,c,d,k[13],4,681279174);d=hh(d,a,b,c,k[0],11,-358537222);c=hh(c,d,a,b,k[3],16,-722521979);b=hh(b,c,d,a,k[6],23,76029189);a=hh(a,b,c,d,k[9],4,-640364487);d=hh(d,a,b,c,k[12],11,-421815835);c=hh(c,d,a,b,k[15],16,530742520);b=hh(b,c,d,a,k[2],23,-995338651);a=ii(a,b,c,d,k[0],6,-198630844);d=ii(d,a,b,c,k[7],10,1126891415);c=ii(c,d,a,b,k[14],15,-1416354905);b=ii(b,c,d,a,k[5],21,-57434055);a=ii(a,b,c,d,k[12],6,1700485571);d=ii(d,a,b,c,k[3],10,-1894986606);c=ii(c,d,a,b,k[10],15,-1051523);b=ii(b,c,d,a,k[1],21,-2054922799);a=ii(a,b,c,d,k[8],6,1873313359);d=ii(d,a,b,c,k[15],10,-30611744);c=ii(c,d,a,b,k[6],15,-1560198380);b=ii(b,c,d,a,k[13],21,1309151649);a=ii(a,b,c,d,k[4],6,-145523070);d=ii(d,a,b,c,k[11],10,-1120210379);c=ii(c,d,a,b,k[2],15,718787259);b=ii(b,c,d,a,k[9],21,-343485551);x[0]=add32(a,x[0]);x[1]=add32(b,x[1]);x[2]=add32(c,x[2]);x[3]=add32(d,x[3]);}
function cmn(q,a,b,x,s,t){a=((a+q)&0xffffffff)+((x+t)&0xffffffff);return (((a<<s)|(a>>>(32-s)))+b)&0xffffffff;} function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,s,t);} function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,s,t);} function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t);} function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,s,t);}
function md51(s){var n=s.length;var state=[1732584193,-271733879,-1732584194,271733878];var i;for(i=64;i<=s.length;i+=64)md5cycle(state,md5blk(s.substring(i-64,i)));s=s.substring(i-64);var tail=new Array(16);for(var q=0;q<16;q++)tail[q]=0;for(i=0;i<s.length;i++)tail[i>>2]|=s.charCodeAt(i)<<((i%4)<<3);tail[i>>2]|=0x80<<((i%4)<<3);if(i>55){md5cycle(state,tail);for(i=0;i<16;i++)tail[i]=0;}tail[14]=n*8;md5cycle(state,tail);return state;}
function md5blk(s){var out=[];for(var i=0;i<64;i+=4)out[i>>2]=s.charCodeAt(i)+(s.charCodeAt(i+1)<<8)+(s.charCodeAt(i+2)<<16)+(s.charCodeAt(i+3)<<24);return out;}
function rhex(n){var s="";for(var j=0;j<4;j++)s+=hexChr[(n>>(j*8+4))&15]+hexChr[(n>>(j*8))&15];return s;} function hex(x){for(var i=0;i<x.length;i++)x[i]=rhex(x[i]);return x.join("");} function md5(s){return hex(md51(s));}
function hmacMd5(message,key){var blockSize=64;if(key.length>blockSize)key=hexToRaw(md5(key));while(key.length<blockSize)key+="\x00";var o="",i="";for(var n=0;n<blockSize;n++){var c=key.charCodeAt(n);o+=String.fromCharCode(c^0x5c);i+=String.fromCharCode(c^0x36);}return md5(o+hexToRaw(md5(i+message)));}
function hexToRaw(hexStr){var out="";for(var i=0;i<hexStr.length;i+=2)out+=String.fromCharCode(parseInt(hexStr.substr(i,2),16));return out;}


function textValue(value: any): string {
  return value === undefined || value === null || value === "" ? "--" : String(value);
}

// 尺寸按原版 Omni 小组件：图标约 12pt，普通文字 10~11pt，大数字 31pt。
function Chip({ icon, text, tint = "label", compact = false }: any) {
  return <HStack spacing={compact ? 5 : 4} padding={compact ? { horizontal: 8, vertical: 3 } : { horizontal: 6, vertical: 3 }} alignment="center" modifiers={modifiers().background(widgetBg).clipShape({ type: "rect", cornerRadius: compact ? 12 : 10 }).frame({ height: compact ? 25 : 22 })}><Image systemName={icon} frame={{ width: compact ? 13 : 13, height: compact ? 13 : 13 }} modifiers={modifiers().foregroundStyle(tint)} /><Text font={compact ? 9 : 10} modifiers={modifiers().foregroundStyle("label").lineLimit(1).minScaleFactor(0.5)}>{text}</Text></HStack>;
}

function Traffic({ title, value, unit, compact = false }: any) {
  return (
    <VStack spacing={1} alignment="center">
      <Text font={compact ? 10 : 11} modifiers={modifiers().foregroundStyle("#0056D6").bold()}>{title}</Text>
      <HStack spacing={2} alignment="lastTextBaseline">
        <Text font={compact ? 25 : 31} modifiers={modifiers().foregroundStyle("label").bold().monospacedDigit()}>{value}</Text>
        <Text font={compact ? 12 : 16} modifiers={modifiers().foregroundStyle("label")}>{unit}</Text>
      </HStack>
    </VStack>
  );
}

function Card({ children, compact = false }: any) {
  return (
    <VStack spacing={compact ? 7 : 4} padding={compact ? 10 : { top: 8, bottom: 7, leading: 12, trailing: 12 }} alignment="center" frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={widgetBg}>
      {children}
    </VStack>
  );
}

function Header({ compact = false }: any) {
  return (
    <HStack spacing={compact ? 3 : 5} alignment="center">
      <Image systemName="wifi.router.fill" frame={{ width: compact ? 14 : 16, height: compact ? 14 : 16 }} modifiers={modifiers().foregroundStyle("#0056D6")} />
      <Text font={compact ? 11 : 12} modifiers={modifiers().foregroundStyle("label").bold()}>{textValue(state.model_name)}</Text>
      <Text font={compact ? 10 : 11} modifiers={modifiers().foregroundStyle("label")}>UFI v{textValue(state.ufi_ver)}</Text>
      <Spacer />
      <Image systemName="cellularbars" frame={{ width: compact ? 13 : 15, height: compact ? 13 : 15 }} modifiers={modifiers().foregroundStyle("label")} />
      <Text font={compact ? 9 : 10} modifiers={modifiers().foregroundStyle("label")}>{textValue(state.signalbar)}</Text>
      <Image systemName={textValue(state.battery_icon)} frame={{ width: compact ? 14 : 16, height: compact ? 14 : 16 }} modifiers={modifiers().foregroundStyle("#16A34A")} />
      <Text font={compact ? 9 : 10} modifiers={modifiers().foregroundStyle("label")}>{textValue(state.battery)}%</Text>
    </HStack>
  );
}

function OriginalChip({ icon, text, tint }: any) {
  var iconOffset = icon === "envelope.badge" ? -2 : 0;
  var iconMod = modifiers().foregroundStyle(tint);
  if (iconOffset !== 0) iconMod = iconMod.offset({ x: 0, y: iconOffset });
  return <HStack spacing={3} padding={{ top: 3, bottom: 3, leading: 6, trailing: 6 }} background={pillBg} alignment="center" modifiers={modifiers().clipShape({ type: "rect", cornerRadius: 11 }).frame({ height: 23, maxWidth: "infinity" })}><Image systemName={icon} font={11} frame={{ width: 13, height: 13 }} modifiers={iconMod} /><Text font={state.status_font || 8.5} fontWeight="semibold" modifiers={modifiers().foregroundStyle("label").lineLimit(1).minScaleFactor(0.55)}>{text}</Text></HStack>;
}

function MediumDashboard() {
  return (
    <Card>
      <HStack spacing={5} alignment="center" modifiers={modifiers().frame({ height: 20 })}>
        <Image systemName="wifi.router.fill" font={14} frame={{ width: 18, height: 18 }} modifiers={modifiers().foregroundStyle("systemBlue")} />
        <Text font={11} modifiers={modifiers().foregroundStyle("label").bold().lineLimit(1).minScaleFactor(0.72).frame({ height: 20 }).baselineOffset(2)}>{textValue(state.model_name)}</Text>
        <Text font={10} modifiers={modifiers().foregroundStyle("label").lineLimit(1).minScaleFactor(0.55).frame({ height: 20 }).baselineOffset(2)}>UFI v{textValue(state.ufi_ver)}</Text>
        <Spacer minLength={2} />
        <Image systemName="cellularbars" font={14} frame={{ width: 16, height: 16 }} modifiers={modifiers().foregroundStyle("secondaryLabel")} />
        <Text font={11} modifiers={modifiers().foregroundStyle("label").bold().monospacedDigit().lineLimit(1).minScaleFactor(0.7).frame({ height: 20 })}>{textValue(state.signalbar)}</Text>
        <Text font={12} modifiers={modifiers().foregroundStyle("separator").frame({ height: 20 })}>|</Text>
        <Image systemName={textValue(state.battery_icon)} font={16} frame={{ width: 18, height: 18 }} modifiers={modifiers().foregroundStyle("systemGreen")} />
        <Text font={11} modifiers={modifiers().foregroundStyle("label").bold().monospacedDigit().lineLimit(1).minScaleFactor(0.7).frame({ height: 20 })}>{textValue(state.battery)}%</Text>
      </HStack>
      <HStack spacing={12} alignment="center" modifiers={modifiers().frame({ height: 50 })}>
        <VStack spacing={0} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity" })}><Text font={12} modifiers={modifiers().foregroundStyle("systemBlue").bold()}>今日流量</Text><HStack spacing={3} alignment="lastTextBaseline"><Text font={31} modifiers={modifiers().foregroundStyle("label").bold().monospacedDigit().lineLimit(1).minScaleFactor(0.68)}>{textValue(state.daily_data_value)}</Text><Text font={13} modifiers={modifiers().foregroundStyle("label").bold().lineLimit(1).minScaleFactor(0.65)}>{textValue(state.daily_data_unit)}</Text></HStack></VStack>
        <Text font={34} modifiers={modifiers().foregroundStyle("separator")}>│</Text>
        <VStack spacing={0} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity" })}><Text font={12} modifiers={modifiers().foregroundStyle("systemBlue").bold()}>本月流量</Text><HStack spacing={3} alignment="lastTextBaseline"><Text font={31} modifiers={modifiers().foregroundStyle("label").bold().monospacedDigit().lineLimit(1).minScaleFactor(0.68)}>{textValue(state.monthly_data_value)}</Text><Text font={13} modifiers={modifiers().foregroundStyle("label").bold().lineLimit(1).minScaleFactor(0.65)}>{textValue(state.monthly_data_unit)}</Text></HStack></VStack>
      </HStack>
      <VStack spacing={4} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity" })}>
        <HStack spacing={4} padding={{ horizontal: 4 }} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity", height: 23 })}><OriginalChip icon="network" text={textValue(state.net_summary)} tint="systemCyan" /><OriginalChip icon="antenna.radiowaves.left.and.right" text={textValue(state.band_text)} tint="systemBlue" /><OriginalChip icon="cpu.fill" text={textValue(state.cpuusage) + "%"} tint="systemIndigo" /><OriginalChip icon="thermometer.medium" text={textValue(state.cputemp) + "℃"} tint="systemOrange" /></HStack>
        <HStack spacing={4} padding={{ horizontal: 4 }} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity", height: 23 })}><OriginalChip icon="wifi" text={textValue(state.ssid_text)} tint="systemTeal" /><OriginalChip icon="dot.radiowaves.left.and.right" text={textValue(state.wifi_band_text)} tint="systemTeal" /><OriginalChip icon="memorychip" text={textValue(state.mem_text)} tint="systemPurple" /><OriginalChip icon="macbook.and.ipod" text={textValue(state.wifi_device_count)} tint="systemPink" /><OriginalChip icon="envelope.badge" text={textValue(state.sms_unread_text)} tint={Number(state.sms_unread_text) > 0 ? "systemRed" : "systemBlue"} /></HStack>
      </VStack>
      <HStack spacing={4} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity", height: 17 })}><HStack spacing={4} alignment="leading" modifiers={modifiers().frame({ maxWidth: "infinity", alignment: "leading" }).padding({ leading: 2 })}><Image systemName="antenna.radiowaves.left.and.right.circle" font={11} frame={{ width: 11, height: 11 }} modifiers={modifiers().foregroundStyle("systemBlue")} /><Text font={8} modifiers={modifiers().foregroundStyle("secondaryLabel").monospacedDigit().lineLimit(1).minScaleFactor(0.55)}>RSRP {textValue(state.rsrp_text)} · RSRQ {textValue(state.rsrq_text)} · SNR {textValue(state.snr_text)}</Text></HStack><Spacer minLength={1} /><HStack spacing={3} alignment="center"><Image systemName="clock.arrow.trianglehead.2.counterclockwise.rotate.90" font={10} frame={{ width: 10, height: 10 }} modifiers={modifiers().foregroundStyle("systemGreen")} /><Text font={8} modifiers={modifiers().foregroundStyle("secondaryLabel").monospacedDigit().lineLimit(1).minScaleFactor(0.5)}>{textValue(state.update_time)}</Text></HStack></HStack>
    </Card>
  );
}

function SmallDashboard() {
  return (
    <Card compact>
      <HStack spacing={8} alignment="center">
        <Image systemName="wifi.router.fill" frame={{ width: 16, height: 16 }} modifiers={modifiers().foregroundStyle("#0056D6")} />
        <Text font={11} modifiers={modifiers().foregroundStyle("label").bold().minScaleFactor(0.75).frame({ height: 20 }).baselineOffset(2)}>{textValue(state.model_name)}</Text>
        <Spacer />
        <Image systemName={textValue(state.battery_icon)} frame={{ width: 16, height: 16 }} modifiers={modifiers().foregroundStyle("#16A34A")} />
        <Text font={10} modifiers={modifiers().foregroundStyle("label").frame({ height: 20 })}>{textValue(state.battery)}%</Text>
      </HStack>
      <Traffic compact title="今日流量" value={textValue(state.daily_data_value)} unit={textValue(state.daily_data_unit)} />
      <HStack spacing={5} alignment="center">
        <Chip compact icon="antenna.radiowaves.left.and.right" text={textValue(state.rsrp_text)} tint="#0F766E" />
        <Chip compact icon="wifi" text={textValue(state.ssid_text)} tint="#0F766E" />
      </HStack>
      <Text font={8} modifiers={modifiers().foregroundStyle("secondaryLabel").monospacedDigit()}>{textValue(state.update_time)}</Text>
    </Card>
  );
}

function LargeDashboard() {
  return (
    <Card>
      <Header />
      <HStack spacing={25}><Traffic title="今日流量" value={textValue(state.daily_data_value)} unit={textValue(state.daily_data_unit)} /><Text font={38} modifiers={modifiers().foregroundStyle("secondaryLabel")}>│</Text><Traffic title="本月流量" value={textValue(state.monthly_data_value)} unit={textValue(state.monthly_data_unit)} /></HStack>
      <HStack spacing={5}><Chip icon="thermometer.medium" text={textValue(state.cputemp) + "℃"} tint="#E5484D" /><Chip icon="cpu.fill" text={textValue(state.cpuusage) + "%"} tint="#2563EB" /><Chip icon="globe" text={textValue(state.net_summary)} tint="#0891B2" /><Chip icon="antenna.radiowaves.left.and.right" text={textValue(state.rsrp_text)} tint="#0F766E" /></HStack>
      <HStack spacing={5}><Chip icon="wifi" text={textValue(state.ssid_text)} tint="#0F766E" /><Chip icon="cube.fill" text={textValue(state.band_text)} tint="#7C3AED" /><Chip icon="memorychip" text={textValue(state.mem_text)} tint="#7C3AED" /><Chip icon="checkmark.seal.fill" text="就绪" tint="#16A34A" /></HStack>
      <HStack spacing={5}><Chip icon="macbook.and.ipod" text={textValue(state.wifi_device_count) + "台"} tint="#7A219E" /><Chip icon="envelope.badge" text={textValue(state.sms_unread_text) + "未读"} tint="#DC2626" /></HStack>
      <Text font={10} modifiers={modifiers().foregroundStyle("secondaryLabel").monospacedDigit()}>{textValue(state.update_time)}</Text>
    </Card>
  );
}

function Dashboard() {
  if (Widget.family === "systemSmall") return <SmallDashboard />;
  if (Widget.family === "systemLarge") return <LargeDashboard />;
  return <MediumDashboard />;
}

Widget.present(<Dashboard />);
})();
