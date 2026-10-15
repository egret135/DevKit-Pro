/* Local color parse / convert / contrast / palette utilities — no remote deps */

const ColorUtil = (function () {
    'use strict';

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    function clamp01(n) {
        return clamp(n, 0, 1);
    }

    function round(n, d) {
        const p = Math.pow(10, d == null ? 0 : d);
        return Math.round(n * p) / p;
    }

    function rgba(r, g, b, a) {
        return {
            r: clamp(Math.round(r), 0, 255),
            g: clamp(Math.round(g), 0, 255),
            b: clamp(Math.round(b), 0, 255),
            a: a == null ? 1 : clamp01(a)
        };
    }

    function parseAlphaToken(tok) {
        if (tok == null || tok === '') return 1;
        const t = String(tok).trim();
        if (t.endsWith('%')) return clamp01(parseFloat(t) / 100);
        return clamp01(parseFloat(t));
    }

    function parseRgbChannel(tok) {
        const t = String(tok).trim();
        if (t.endsWith('%')) return clamp(Math.round(parseFloat(t) * 2.55), 0, 255);
        return clamp(Math.round(parseFloat(t)), 0, 255);
    }

    function parseHue(tok) {
        const t = String(tok).trim().toLowerCase();
        if (t.endsWith('turn')) return ((parseFloat(t) % 1) + 1) % 1 * 360;
        if (t.endsWith('rad')) return (parseFloat(t) * 180) / Math.PI;
        if (t.endsWith('grad')) return (parseFloat(t) * 0.9);
        // deg or unitless
        return ((parseFloat(t) % 360) + 360) % 360;
    }

    // ---------- HEX ----------
    function fromHex(str) {
        let h = String(str).trim().replace(/^#/, '');
        if (!/^[0-9a-f]+$/i.test(h)) return null;
        if (h.length === 3 || h.length === 4) {
            h = h.split('').map((c) => c + c).join('');
        }
        if (h.length !== 6 && h.length !== 8) return null;
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
        return rgba(r, g, b, a);
    }

    function toHex(c, withAlpha, uppercase) {
        const hex = [c.r, c.g, c.b]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
        let out = '#' + hex;
        if (withAlpha) {
            out += Math.round(clamp01(c.a) * 255).toString(16).padStart(2, '0');
        }
        return uppercase ? out.toUpperCase() : out.toLowerCase();
    }

    // ---------- HSL ----------
    function rgbToHsl(c) {
        const r = c.r / 255;
        const g = c.g / 255;
        const b = c.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let h = 0;
        let s = 0;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                default: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return {
            h: round(h * 360, 1),
            s: round(s * 100, 1),
            l: round(l * 100, 1),
            a: c.a
        };
    }

    function hslToRgb(h, s, l, a) {
        h = ((h % 360) + 360) % 360 / 360;
        s = clamp01(s / 100);
        l = clamp01(l / 100);
        let r;
        let g;
        let b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return rgba(r * 255, g * 255, b * 255, a);
    }

    // ---------- HWB ----------
    function rgbToHwb(c) {
        const hsl = rgbToHsl(c);
        const r = c.r / 255;
        const g = c.g / 255;
        const b = c.b / 255;
        const white = Math.min(r, g, b);
        const black = 1 - Math.max(r, g, b);
        return {
            h: hsl.h,
            w: round(white * 100, 1),
            b: round(black * 100, 1),
            a: c.a
        };
    }

    function hwbToRgb(h, w, bl, a) {
        w = clamp01(w / 100);
        bl = clamp01(bl / 100);
        if (w + bl >= 1) {
            const gray = w / (w + bl);
            return rgba(gray * 255, gray * 255, gray * 255, a);
        }
        const rgb = hslToRgb(h, 100, 50, 1);
        let r = rgb.r / 255;
        let g = rgb.g / 255;
        let b = rgb.b / 255;
        r = r * (1 - w - bl) + w;
        g = g * (1 - w - bl) + w;
        b = b * (1 - w - bl) + w;
        return rgba(r * 255, g * 255, b * 255, a);
    }

    // ---------- OKLab / OKLCH ----------
    function srgbToLinear(c) {
        const x = c / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    }

    function linearToSrgb(c) {
        const x = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
        return clamp(Math.round(x * 255), 0, 255);
    }

    function rgbToOklab(c) {
        const r = srgbToLinear(c.r);
        const g = srgbToLinear(c.g);
        const b = srgbToLinear(c.b);
        const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
        const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
        const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
        const l_ = Math.cbrt(l);
        const m_ = Math.cbrt(m);
        const s_ = Math.cbrt(s);
        return {
            L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
            alpha: c.a
        };
    }

    function oklabToRgb(lab) {
        const L = lab.L;
        const a = lab.a;
        const b = lab.b;
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
        const l = l_ * l_ * l_;
        const m = m_ * m_ * m_;
        const s = s_ * s_ * s_;
        const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        return rgba(linearToSrgb(r), linearToSrgb(g), linearToSrgb(bl), lab.alpha == null ? 1 : lab.alpha);
    }

    function rgbToOklch(c) {
        const lab = rgbToOklab(c);
        const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
        let H = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
        if (H < 0) H += 360;
        return {
            L: round(lab.L, 4),
            C: round(C, 4),
            H: round(C < 1e-6 ? 0 : H, 2),
            a: c.a
        };
    }

    function oklchToRgb(L, C, H, a) {
        const hRad = ((H % 360) + 360) % 360 * Math.PI / 180;
        return oklabToRgb({
            L: clamp01(L),
            a: C * Math.cos(hRad),
            b: C * Math.sin(hRad),
            alpha: a
        });
    }

    // ---------- Parse ----------
    function parseFunctionArgs(body) {
        // Split on spaces/commas but keep slash alpha separate.
        const slash = body.split('/');
        const main = slash[0].trim();
        const alphaTok = slash[1] != null ? slash[1].trim() : null;
        const parts = main.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
        return { parts, alphaTok };
    }

    function parse(input) {
        if (input == null) return null;
        const raw = String(input).trim();
        if (!raw) return null;

        // Bare hex
        if (/^#?[0-9a-f]{3,8}$/i.test(raw)) {
            return fromHex(raw);
        }

        const fn = raw.match(/^([a-z]+)\(\s*(.+)\s*\)$/i);
        if (!fn) return null;
        const name = fn[1].toLowerCase();
        const { parts, alphaTok } = parseFunctionArgs(fn[2]);

        if (name === 'rgb' || name === 'rgba') {
            if (parts.length < 3) return null;
            const r = parseRgbChannel(parts[0]);
            const g = parseRgbChannel(parts[1]);
            const b = parseRgbChannel(parts[2]);
            let a = 1;
            if (alphaTok != null) a = parseAlphaToken(alphaTok);
            else if (parts[3] != null) a = parseAlphaToken(parts[3]);
            return rgba(r, g, b, a);
        }

        if (name === 'hsl' || name === 'hsla') {
            if (parts.length < 3) return null;
            const h = parseHue(parts[0]);
            const s = parseFloat(parts[1]);
            const l = parseFloat(parts[2]);
            let a = 1;
            if (alphaTok != null) a = parseAlphaToken(alphaTok);
            else if (parts[3] != null) a = parseAlphaToken(parts[3]);
            return hslToRgb(h, s, l, a);
        }

        if (name === 'hwb') {
            if (parts.length < 3) return null;
            const h = parseHue(parts[0]);
            const w = parseFloat(parts[1]);
            const bl = parseFloat(parts[2]);
            let a = 1;
            if (alphaTok != null) a = parseAlphaToken(alphaTok);
            else if (parts[3] != null) a = parseAlphaToken(parts[3]);
            return hwbToRgb(h, w, bl, a);
        }

        if (name === 'oklch') {
            if (parts.length < 3) return null;
            let L = parseFloat(parts[0]);
            if (String(parts[0]).trim().endsWith('%')) L = L / 100;
            const C = parseFloat(parts[1]);
            const H = parseHue(parts[2]);
            let a = 1;
            if (alphaTok != null) a = parseAlphaToken(alphaTok);
            else if (parts[3] != null) a = parseAlphaToken(parts[3]);
            return oklchToRgb(L, C, H, a);
        }

        return null;
    }

    // ---------- Format ----------
    function formatAlpha(a, modern) {
        const v = round(clamp01(a), 3);
        if (modern) return String(v);
        return String(v);
    }

    function format(c, options = {}) {
        const uppercase = !!options.uppercase;
        const modern = !!options.modernSyntax;
        const hsl = rgbToHsl(c);
        const hwb = rgbToHwb(c);
        const oklch = rgbToOklch(c);
        const hasAlpha = c.a < 0.999;

        const hex = toHex(c, false, uppercase);
        const hex8 = toHex(c, true, uppercase);

        let rgb;
        let hslStr;
        let hwbStr;
        let oklchStr;

        if (modern) {
            rgb = hasAlpha
                ? `rgb(${c.r} ${c.g} ${c.b} / ${formatAlpha(c.a)})`
                : `rgb(${c.r} ${c.g} ${c.b})`;
            hslStr = hasAlpha
                ? `hsl(${hsl.h} ${hsl.s}% ${hsl.l}% / ${formatAlpha(c.a)})`
                : `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`;
            hwbStr = hasAlpha
                ? `hwb(${hwb.h} ${hwb.w}% ${hwb.b}% / ${formatAlpha(c.a)})`
                : `hwb(${hwb.h} ${hwb.w}% ${hwb.b}%)`;
            oklchStr = hasAlpha
                ? `oklch(${oklch.L} ${oklch.C} ${oklch.H} / ${formatAlpha(c.a)})`
                : `oklch(${oklch.L} ${oklch.C} ${oklch.H})`;
        } else {
            rgb = hasAlpha
                ? `rgba(${c.r}, ${c.g}, ${c.b}, ${formatAlpha(c.a)})`
                : `rgb(${c.r}, ${c.g}, ${c.b})`;
            hslStr = hasAlpha
                ? `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${formatAlpha(c.a)})`
                : `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
            hwbStr = hasAlpha
                ? `hwb(${hwb.h} ${hwb.w}% ${hwb.b}% / ${formatAlpha(c.a)})`
                : `hwb(${hwb.h} ${hwb.w}% ${hwb.b}%)`;
            oklchStr = hasAlpha
                ? `oklch(${oklch.L} ${oklch.C} ${oklch.H} / ${formatAlpha(c.a)})`
                : `oklch(${oklch.L} ${oklch.C} ${oklch.H})`;
        }

        return { hex, hex8, rgb, hsl: hslStr, hwb: hwbStr, oklch: oklchStr, hslParts: hsl, hwbParts: hwb, oklchParts: oklch };
    }

    // ---------- WCAG contrast ----------
    function relativeLuminance(c) {
        const toLin = (v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
    }

    // Composite foreground over opaque background (for alpha)
    function composite(fg, bg) {
        const a = clamp01(fg.a);
        if (a >= 0.999) return rgba(fg.r, fg.g, fg.b, 1);
        const inv = 1 - a;
        return rgba(
            fg.r * a + bg.r * inv,
            fg.g * a + bg.g * inv,
            fg.b * a + bg.b * inv,
            1
        );
    }

    function contrastRatio(c1, c2) {
        const L1 = relativeLuminance(c1);
        const L2 = relativeLuminance(c2);
        const lighter = Math.max(L1, L2);
        const darker = Math.min(L1, L2);
        return round((lighter + 0.05) / (darker + 0.05), 2);
    }

    function contrastReport(fg, bg) {
        const solidFg = composite(fg, bg);
        const ratio = contrastRatio(solidFg, bg);
        return {
            ratio,
            aaNormal: ratio >= 4.5,
            aaLarge: ratio >= 3,
            aaaNormal: ratio >= 7,
            aaaLarge: ratio >= 4.5
        };
    }

    // ---------- Ramps & harmony ----------
    function mix(a, b, t) {
        t = clamp01(t);
        return rgba(
            a.r + (b.r - a.r) * t,
            a.g + (b.g - a.g) * t,
            a.b + (b.b - a.b) * t,
            a.a + (b.a - a.a) * t
        );
    }

    function tintShadeRamp(c, steps) {
        const n = steps || 9;
        const mid = Math.floor(n / 2);
        const white = rgba(255, 255, 255, c.a);
        const black = rgba(0, 0, 0, c.a);
        const out = [];
        for (let i = 0; i < n; i++) {
            if (i < mid) {
                const t = (mid - i) / mid;
                out.push(mix(c, white, t * 0.85));
            } else if (i === mid) {
                out.push(rgba(c.r, c.g, c.b, c.a));
            } else {
                const t = (i - mid) / (n - 1 - mid);
                out.push(mix(c, black, t * 0.75));
            }
        }
        return out;
    }

    function rotateHue(c, deg) {
        const hsl = rgbToHsl(c);
        return hslToRgb(hsl.h + deg, hsl.s, hsl.l, c.a);
    }

    function harmonies(c) {
        return {
            complementary: [c, rotateHue(c, 180)],
            analogous: [rotateHue(c, -30), c, rotateHue(c, 30)],
            triadic: [c, rotateHue(c, 120), rotateHue(c, 240)]
        };
    }

    function pickerHex(c) {
        // <input type="color"> only accepts #rrggbb
        return toHex(rgba(c.r, c.g, c.b, 1), false, false);
    }

    function cssBackground(c) {
        if (c.a >= 0.999) return toHex(c, false, false);
        return `rgba(${c.r}, ${c.g}, ${c.b}, ${round(c.a, 3)})`;
    }

    const WHITE = rgba(255, 255, 255, 1);
    const BLACK = rgba(0, 0, 0, 1);

    return {
        parse,
        rgba,
        fromHex,
        toHex,
        format,
        rgbToHsl,
        hslToRgb,
        rgbToHwb,
        hwbToRgb,
        rgbToOklch,
        oklchToRgb,
        relativeLuminance,
        contrastRatio,
        contrastReport,
        composite,
        tintShadeRamp,
        harmonies,
        rotateHue,
        mix,
        pickerHex,
        cssBackground,
        WHITE,
        BLACK
    };
})();

if (typeof DevKit !== 'undefined') {
    DevKit.Color = ColorUtil;
}
