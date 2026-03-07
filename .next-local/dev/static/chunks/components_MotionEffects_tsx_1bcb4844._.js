(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/components/MotionEffects.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MotionEffects",
    ()=>MotionEffects
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function MotionEffects() {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MotionEffects.useEffect": ()=>{
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                document.querySelectorAll("[data-reveal]").forEach({
                    "MotionEffects.useEffect": (node)=>{
                        node.classList.add("is-visible");
                    }
                }["MotionEffects.useEffect"]);
                return;
            }
            const revealTargets = document.querySelectorAll("[data-reveal]");
            const revealObserver = new IntersectionObserver({
                "MotionEffects.useEffect": (entries)=>{
                    entries.forEach({
                        "MotionEffects.useEffect": (entry)=>{
                            if (entry.isIntersecting) {
                                entry.target.classList.add("is-visible");
                                revealObserver.unobserve(entry.target);
                            }
                        }
                    }["MotionEffects.useEffect"]);
                }
            }["MotionEffects.useEffect"], {
                threshold: 0.08,
                rootMargin: "0px 0px -8% 0px"
            });
            revealTargets.forEach({
                "MotionEffects.useEffect": (node, index)=>{
                    node.style.setProperty("--reveal-delay", `${Math.min(index * 35, 140)}ms`);
                    revealObserver.observe(node);
                }
            }["MotionEffects.useEffect"]);
            return ({
                "MotionEffects.useEffect": ()=>{
                    revealObserver.disconnect();
                }
            })["MotionEffects.useEffect"];
        }
    }["MotionEffects.useEffect"], [
        pathname
    ]);
    return null;
}
_s(MotionEffects, "V/ldUoOTYUs0Cb2F6bbxKSn7KxI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = MotionEffects;
var _c;
__turbopack_context__.k.register(_c, "MotionEffects");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=components_MotionEffects_tsx_1bcb4844._.js.map