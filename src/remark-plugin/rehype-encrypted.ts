/**
 * rehype-encrypted — 将标记的加密容器转为 EncryptedContent HTML
 *
 * 需要配合 remark-encrypted 使用。
 * remark-encrypted 将 :::encrypted{password="xxx" hint="yyy"} 转为
 * <div class="encrypted-container-wrapper" data-password="...">，本插件在 rehype
 * 阶段将其子节点渲染为 HTML 后加密。
 *
 * M7-5b（视觉 / a11y 收口）：解锁入口从「正文里直接摊开的表单卡」改成
 * 「门禁卡 + 原生 `<dialog>`」——
 *
 *  · 语义：`<dialog>` 自带 role=dialog / 顶层模态 / Esc 关闭 / 焦点归还；
 *    这里额外写死 `role="dialog" aria-modal="true"` 与 `aria-labelledby`，
 *    并补 Tab 循环陷阱（部分浏览器模态态不自动循环）；
 *  · 关闭态 0 请求：脚本内联在 HTML 里，未解锁时没有任何额外 chunk / fetch；
 *  · 焦点：打开 → 输入框；失败 → 错误提示（role=alert）并留在输入框；
 *    成功 → 关闭 dialog、聚焦解密后的内容块（tabindex="-1"）；Esc/关闭键 → 回触发按钮；
 *  · 样式来自 `src/styles/pages/encrypted.css`（构建期读入并随第一个加密块内联一次，
 *    这样内容页不需要改 `MarkdownLayout` 也不依赖全局样式表是否引入）；
 *  · **算法与密钥格式一行不动**：PBKDF2-SHA256 / AES-GCM / 100k 迭代 / 同一 blob 布局。
 *
 * 测试用 `buildEncryptedFixture()` 拿到同一套标记 + CSS + 脚本，不写真密码。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toHtml } from "hast-util-to-html";
import { encryptContent } from "../utils/encrypt";
import { visit } from "unist-util-visit";

function childrenToHtml(nodes: any) {
    return toHtml({ type: "root", children: nodes || [] });
}

/**
 * 解锁 dialog 的样式（构建期读入；缺文件不该静默变成无样式）。
 * 用 cwd 而不是 `import.meta.url`：astro.config 会被 Vite 打包成临时文件，
 * 那时 `import.meta.url` 指向临时目录，相对路径会失效。
 */
const ENCRYPTED_CSS = readFileSync(join(process.cwd(), "src/styles/pages/encrypted.css"), "utf8").trim();

const CLOSE_ICON =
    '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5 5 15M5 5l10 10"></path></svg>';

export function rehypeEncrypted() {
    return (tree: any) => {
        let styleInjected = false;

        visit(tree, "element", (node, index, parent) => {
            if (!parent || index === undefined) return;

            const cls = node.properties?.className;
            const classList = Array.isArray(cls)
                ? cls
                : typeof cls === "string"
                  ? cls.split(/\s+/)
                  : [];
            if (!classList.includes("encrypted-container-wrapper")) return;

            const password = String(node.properties["data-password"] || "");
            const hint = String(node.properties["data-hint"] || "");

            if (!password) return;

            const innerHtml = childrenToHtml(node.children || []);

            // Use SHA-256 hash for deterministic salt/IV derivation
            const hash = createHash("sha256").update(password).digest("hex");
            const context = "ctx-" + hash.slice(0, 8);

            const encryptedData = encryptContent(innerHtml, password, context);

            const uid = "ec-" + Math.random().toString(36).slice(2, 8);

            parent.children[index] = buildEncryptedBlock(encryptedData, context, hint, uid);

            // 样式随本页第一个加密块内联一次（per-tree 标记：多页构建不能只注入第一页）
            if (!styleInjected) {
                styleInjected = true;
                (tree.children as any[]).unshift({
                    type: "element",
                    tagName: "style",
                    properties: { "data-encrypted-styles": "" },
                    children: [{ type: "text", value: ENCRYPTED_CSS }],
                });
            }
        });
    };
}

/** 一个加密块 = 门禁卡 + 解锁 dialog + 解密落点 + 内联脚本 */
function buildEncryptedBlock(encryptedData: string, context: string, hint: string, uid: string) {
    return {
        type: "element",
        tagName: "div",
        properties: {
            id: `encrypted-container-${uid}`,
            className: ["enc-block"],
            "data-encrypted": encryptedData,
            "data-slug": context,
            "data-version": "2",
        },
        children: [buildGate(hint, uid), buildDialog(hint, uid), buildOutput(uid), scriptNode(uid)],
    };
}

function buildGate(hint: string, uid: string) {
    const children: any[] = [
        el("p", ["enc-gate__badge"], [txt("Encrypted")]),
        el("h2", ["enc-gate__title"], [txt("此段内容已加密")]),
        el("p", ["enc-gate__desc"], [txt("输入密码后在本浏览器内解密，密码不会上传。")]),
    ];

    if (hint) children.push(el("p", ["enc-gate__hint"], [txt(`提示：${hint}`)]));

    children.push({
        type: "element",
        tagName: "button",
        properties: {
            id: `encrypted-open-${uid}`,
            type: "button",
            className: ["enc-gate__open"],
            "aria-haspopup": "dialog",
            "aria-controls": `encrypted-dialog-${uid}`,
        },
        children: [txt("输入密码解锁")],
    });

    return {
        type: "element",
        tagName: "div",
        properties: { id: `encrypted-gate-${uid}`, className: ["enc-gate"] },
        children,
    };
}

function buildDialog(hint: string, uid: string) {
    const descId = `encrypted-dialog-desc-${uid}`;
    const titleId = `encrypted-dialog-title-${uid}`;
    const errorId = `password-error-${uid}`;

    const inner: any[] = [
        el("h2", ["enc-dialog__title"], [txt("解锁加密内容")], titleId),
        {
            type: "element",
            tagName: "button",
            properties: {
                id: `encrypted-close-${uid}`,
                type: "button",
                className: ["enc-dialog__close"],
                "data-encrypted-close": "",
            },
            children: [
                { type: "raw", value: CLOSE_ICON },
                // 可读名来自这段视觉隐藏文本：「关闭」；不写 aria-label，避免
                // axe label-content-name-mismatch（图标 aria-hidden 后无可读文本）
                el("span", ["enc-dialog__close-text"], [txt("关闭")]),
            ],
        },
        el("p", ["enc-dialog__desc"], [txt("密码只在本机浏览器里用于解密，不会发送到服务器。")], descId),
        hint ? el("p", ["enc-dialog__hint"], [txt(`提示：${hint}`)]) : null,
        {
            type: "element",
            tagName: "form",
            properties: { id: `password-form-${uid}`, className: ["enc-dialog__form"], novalidate: true },
            children: [
                {
                    type: "element",
                    tagName: "label",
                    properties: { for: `password-input-${uid}`, className: ["enc-dialog__label"] },
                    children: [txt("密码")],
                },
                {
                    type: "element",
                    tagName: "input",
                    properties: {
                        id: `password-input-${uid}`,
                        type: "password",
                        name: "password",
                        placeholder: "输入密码",
                        autocomplete: "current-password",
                        autocapitalize: "off",
                        spellcheck: false,
                        required: true,
                        className: ["enc-dialog__input"],
                    },
                    children: [],
                },
                {
                    type: "element",
                    tagName: "p",
                    properties: {
                        id: errorId,
                        className: ["enc-dialog__error"],
                        role: "alert",
                        hidden: "",
                    },
                    children: [],
                },
                {
                    type: "element",
                    tagName: "button",
                    properties: { type: "submit", className: ["enc-dialog__submit"] },
                    children: [txt("解锁")],
                },
            ],
        },
    ].filter(Boolean);

    return {
        type: "element",
        tagName: "dialog",
        properties: {
            id: `encrypted-dialog-${uid}`,
            className: ["enc-dialog"],
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            "aria-describedby": descId,
        },
        children: [
            {
                type: "element",
                tagName: "div",
                properties: { className: ["enc-dialog__panel"] },
                children: inner,
            },
        ],
    };
}

function buildOutput(uid: string) {
    return {
        type: "element",
        tagName: "div",
        properties: {
            id: `decrypted-content-${uid}`,
            className: ["enc-content"],
            tabindex: "-1",
            hidden: "",
        },
        children: [],
    };
}

function scriptNode(uid: string) {
    return { type: "raw", value: `<script>${buildScript(uid)}</script>` };
}

/**
 * 解锁 UI 状态机（内联经典脚本 —— 内容页不需要额外 chunk，也就没有「关闭态请求」）。
 * 解密部分与旧实现逐字节等价：PBKDF2-SHA256(100k) → AES-GCM，blob = salt(16)|iv(12)|tag(16)|ct。
 */
function buildScript(uid: string): string {
    return `(function(){
var id="${uid}";
var c=document.getElementById("encrypted-container-"+id);if(!c)return;
var d=c.getAttribute("data-encrypted"),s=c.getAttribute("data-slug");
var gate=document.getElementById("encrypted-gate-"+id);
var dlg=document.getElementById("encrypted-dialog-"+id);
var openBtn=document.getElementById("encrypted-open-"+id);
var closeBtn=document.getElementById("encrypted-close-"+id);
var f=document.getElementById("password-form-"+id);
var i=document.getElementById("password-input-"+id);
var e=document.getElementById("password-error-"+id);
var t=document.getElementById("decrypted-content-"+id);
if(!d||!gate||!dlg||!openBtn||!f||!i||!e||!t)return;
var ck="pw:"+s;
function b64toBuf(b){var a=atob(b),u=new Uint8Array(a.length);for(var k=0;k<a.length;k++)u[k]=a.charCodeAt(k);return u}
async function dec(pwd){
var r=b64toBuf(d),salt=r.slice(0,16),iv=r.slice(16,28),tag=r.slice(28,44),ct=r.slice(44);
var buf=new Uint8Array(ct.length+16);buf.set(ct);buf.set(tag,ct.length);
var enc=new TextEncoder();
var km=await crypto.subtle.importKey("raw",enc.encode(pwd),"PBKDF2",false,["deriveBits","deriveKey"]);
var key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:100000,hash:"SHA-256"},km,{name:"AES-GCM",length:256},false,["decrypt"]);
return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:iv},key,buf));
}
function cacheGet(){try{return sessionStorage.getItem(ck)}catch(err){return null}}
function cacheSet(v){try{sessionStorage.setItem(ck,v)}catch(err){}}
function cacheDel(){try{sessionStorage.removeItem(ck)}catch(err){}}
function hydrate(){
var st=t.querySelectorAll("script");
for(var j=0;j<st.length;j++){var sc=st[j],ns=document.createElement("script");
for(var k=0;k<sc.attributes.length;k++)ns.setAttribute(sc.attributes[k].name,sc.attributes[k].value);
ns.textContent=sc.textContent;sc.parentNode.replaceChild(ns,sc)}
}
function unlock(html){
t.innerHTML=html;t.hidden=false;gate.hidden=true;
hydrate();
if(dlg.open)dlg.close();
t.focus();
}
function fail(msg){
e.textContent=msg;e.hidden=false;i.setAttribute("aria-invalid","true");
i.focus();i.select();
}
function reset(){
e.hidden=true;e.textContent="";i.removeAttribute("aria-invalid");
}
openBtn.addEventListener("click",function(){reset();if(typeof dlg.showModal==="function"){dlg.showModal()}else{dlg.setAttribute("open","")}i.focus()});
closeBtn.addEventListener("click",function(){dlg.close();openBtn.focus()});
dlg.addEventListener("click",function(ev){if(ev.target===dlg)dlg.close()});
dlg.addEventListener("close",function(){reset()});
dlg.addEventListener("keydown",function(ev){
if(ev.key!=="Tab")return;
var nodes=dlg.querySelectorAll('button:not([disabled]),input:not([disabled]),[href],select,textarea,[tabindex]:not([tabindex="-1"])');
var list=[];for(var n=0;n<nodes.length;n++){if(nodes[n].offsetParent!==null)list.push(nodes[n])}
if(!list.length)return;
var first=list[0],last=list[list.length-1];
if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus()}
else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus()}
});
i.addEventListener("input",function(){if(!e.hidden)reset()});
f.addEventListener("submit",function(ev){
ev.preventDefault();
var pwd=i.value.trim();
if(!pwd){fail("请输入密码");return}
reset();
var btn=f.querySelector('button[type="submit"]');
if(btn)btn.disabled=true;
dec(pwd).then(function(html){cacheSet(pwd);if(btn)btn.disabled=false;unlock(html)})
.catch(function(){if(btn)btn.disabled=false;fail("密码不对，请再试一次。")});
});
var cached=cacheGet();
if(cached){dec(cached).then(unlock).catch(function(){cacheDel()})}
})();`;
}

// ---------------------------------------------------------------------------
// 测试夹具：与生产同一套标记 / 样式 / 脚本，供 e2e 注入真实页面（不写真密码）
// ---------------------------------------------------------------------------

export function buildEncryptedFixture(opts: {
    encryptedData: string;
    context: string;
    hint?: string;
    uid?: string;
}): { html: string; css: string; script: string } {
    const uid = opts.uid || "fx1";
    const block = buildEncryptedBlock(opts.encryptedData, opts.context, opts.hint || "", uid);
    // 夹具把脚本单独返回：注入用 innerHTML 时 <script> 不会执行，由调用方显式重建
    const children = (block.children as any[]).slice(0, 3);
    return {
        html: toHtml({ type: "root", children: [{ ...block, children }] } as any),
        css: ENCRYPTED_CSS,
        script: buildScript(uid),
    };
}

function el(tag: any, cls: any, children: any, id?: any) {
    const props: Record<string, any> = { className: cls };
    if (id) props.id = id;
    return { type: "element", tagName: tag, properties: props, children };
}

function txt(value: any) {
    return { type: "text", value };
}
