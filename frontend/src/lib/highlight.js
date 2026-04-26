const SLOT_OPEN = "@@SLOT_";
const SLOT_CLOSE = "_END@@";

export function highlight(code, lang) {
  if (!code) return "";
  let out = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const slots = [];
  const slot = (cls, content) => {
    slots.push({ cls, content });
    return SLOT_OPEN + (slots.length - 1) + SLOT_CLOSE;
  };

  if (lang === "python") {
    out = out.replace(/(#.*)$/gm, (m) => slot("tok-com", m));
  } else {
    out = out.replace(/(\/\/.*)$/gm, (m) => slot("tok-com", m));
    out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => slot("tok-com", m));
  }
  out = out.replace(/("(?:\\.|[^"\\])*")/g, (m) => slot("tok-str", m));
  out = out.replace(/('(?:\\.|[^'\\])*')/g, (m) => slot("tok-str", m));
  out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, (m) => slot("tok-num", m));

  const kws = {
    python: ["def","class","return","if","elif","else","for","while","in","not","and","or","import","from","as","with","try","except","finally","raise","is","lambda","yield","pass","break","continue","None","True","False","self"],
    cpp: ["class","public","private","protected","int","void","return","if","else","for","while","auto","const","static","new","delete","this","using","namespace","template","typename","vector","string","unordered_map","map","list","pair","function","include","struct","virtual","override","nullptr","true","false"],
    java: ["class","public","private","protected","static","final","void","int","return","if","else","for","while","new","this","import","package","extends","implements","interface","abstract","try","catch","finally","throw","throws","null","true","false","Map","HashMap","List","Integer"]
  };
  const list = kws[lang] || [];
  if (list.length) {
    const re = new RegExp("\\b(" + list.join("|") + ")\\b", "g");
    out = out.replace(re, (m) => slot("tok-kw", m));
  }
  out = out.replace(/(?<![\w@])([A-Z][A-Za-z0-9_]*)\b/g, (m) => slot("tok-cls", m));
  out = out.replace(/([a-z_][A-Za-z0-9_]*)(?=\()/g, (m) => slot("tok-fn", m));

  const restoreRe = new RegExp(SLOT_OPEN + "(\\d+)" + SLOT_CLOSE, "g");
  out = out.replace(restoreRe, (_, i) => {
    const s = slots[+i];
    return '<span class="' + s.cls + '">' + s.content + '</span>';
  });
  return out;
}
