import { Script, Widget } from "scripting";

// Pass URL, password, zte_password via Script.queryParameters.
// e.g. scripting-ts run index.tsx --queryparameters '{"URL":"http://192.168.0.1:2333"}'
await Widget.preview({ family: "systemMedium" });
Script.exit();
