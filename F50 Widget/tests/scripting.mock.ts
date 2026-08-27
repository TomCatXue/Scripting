type FetchMock = (req: any) => Promise<any>;

let fetchImpl: FetchMock = async () => ({ status: 599, text: async () => "" });

export function setMockFetch(impl: FetchMock): void {
    fetchImpl = impl;
}

export async function fetch(req: any): Promise<any> {
    const resp = await fetchImpl(req);
    if (resp && typeof resp.json !== "function") {
        resp.json = async () => JSON.parse(await resp.text());
    }
    return resp;
}

export class Request {
    url: string;
    method = "GET";
    headers = new Map<string, string>();
    body: string | null = null;
    timeout = 0;
    allowInsecureRequest = false;

    constructor(url: string) {
        this.url = String(url);
    }
}

export const Script = {};
export const Widget = {};
