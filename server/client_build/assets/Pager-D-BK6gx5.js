import{c as l,j as e}from"./index-D7EnW2yO.js";import{c as h}from"./charts-D8I9C4_Z.js";import"./react-C81ONvQ9.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=l("ChevronLeft",[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=l("ChevronRight",[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]]);function y({page:s,pages:r,total:t,limit:a=20,onChange:i,loading:o,className:d,noun:m="items"}){if(!t||(s-1)*a>=t)return null;const x=(s-1)*a+1,b=Math.min(t,s*a),c=n=>{n<1||n>r||n===s||o||i(n)};return e.jsxs("div",{className:h("no-print flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm sm:px-5",d),children:[e.jsxs("p",{className:"text-slate-500",children:["Showing ",e.jsxs("b",{className:"text-slate-800",children:[x,"–",b]})," of ",e.jsx("b",{className:"text-slate-800",children:t})," ",m]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("button",{type:"button",onClick:()=>c(s-1),disabled:s<=1||o,className:"btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-40","aria-label":"Previous page",children:[e.jsx(f,{className:"h-4 w-4"})," Previous"]}),e.jsxs("span",{className:"min-w-[5.5rem] text-center text-xs font-semibold text-slate-500",children:["Page ",s," of ",r]}),e.jsxs("button",{type:"button",onClick:()=>c(s+1),disabled:s>=r||o,className:"btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-40","aria-label":"Next page",children:["Next ",e.jsx(u,{className:"h-4 w-4"})]})]})]})}export{f as C,y as P};
