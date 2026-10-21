"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/palette-algorithm.js
  var clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  var wrapHue = (hue) => (hue % 360 + 360) % 360;
  function normalizeHex(value) {
    const normalized = value.trim().replace(/^#/, "");
    if (/^[\da-f]{3}$/i.test(normalized)) {
      return `#${normalized.split("").map((character) => character.repeat(2)).join("").toUpperCase()}`;
    }
    if (/^[\da-f]{6}$/i.test(normalized)) {
      return `#${normalized.toUpperCase()}`;
    }
    return null;
  }
  function hexToRgb(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) {
      throw new Error(`Invalid hex color: ${hex}`);
    }
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16)
    };
  }
  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map(
      (value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")
    ).join("").toUpperCase()}`;
  }
  function rgbToHsv({ r, g, b }) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
      if (max === red) h = 60 * ((green - blue) / delta % 6);
      else if (max === green) h = 60 * ((blue - red) / delta + 2);
      else h = 60 * ((red - green) / delta + 4);
    }
    return {
      h: wrapHue(h),
      s: max === 0 ? 0 : delta / max * 100,
      v: max * 100
    };
  }
  function hsvToRgb({ h, s, v }) {
    const hue = wrapHue(h);
    const saturation = clamp(s) / 100;
    const value = clamp(v) / 100;
    const chroma = value * saturation;
    const x = chroma * (1 - Math.abs(hue / 60 % 2 - 1));
    const m = value - chroma;
    let rgb;
    if (hue < 60) rgb = [chroma, x, 0];
    else if (hue < 120) rgb = [x, chroma, 0];
    else if (hue < 180) rgb = [0, chroma, x];
    else if (hue < 240) rgb = [0, x, chroma];
    else if (hue < 300) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
    return {
      r: (rgb[0] + m) * 255,
      g: (rgb[1] + m) * 255,
      b: (rgb[2] + m) * 255
    };
  }
  function rgbToHsl({ r, g, b }) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    const lightness = (max + min) / 2;
    let h = 0;
    if (delta !== 0) {
      if (max === red) h = 60 * ((green - blue) / delta % 6);
      else if (max === green) h = 60 * ((blue - red) / delta + 2);
      else h = 60 * ((red - green) / delta + 4);
    }
    return {
      h: wrapHue(h),
      s: delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)) * 100,
      l: lightness * 100
    };
  }
  function hslToRgb({ h, s, l }) {
    const hue = wrapHue(h);
    const saturation = clamp(s) / 100;
    const lightness = clamp(l) / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs(hue / 60 % 2 - 1));
    const m = lightness - chroma / 2;
    let rgb;
    if (hue < 60) rgb = [chroma, x, 0];
    else if (hue < 120) rgb = [x, chroma, 0];
    else if (hue < 180) rgb = [0, chroma, x];
    else if (hue < 240) rgb = [0, x, chroma];
    else if (hue < 300) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
    return {
      r: (rgb[0] + m) * 255,
      g: (rgb[1] + m) * 255,
      b: (rgb[2] + m) * 255
    };
  }
  var hexToHsl = (hex) => rgbToHsl(hexToRgb(hex));
  var hsvToHex = (color) => rgbToHex(hsvToRgb(color));
  var hslToHex = (color) => rgbToHex(hslToRgb(color));
  var adjustHsv = (color, changes) => {
    var _a, _b, _c;
    return {
      h: wrapHue(color.h + ((_a = changes.h) != null ? _a : 0)),
      s: clamp(color.s + ((_b = changes.s) != null ? _b : 0)),
      v: clamp(color.v + ((_c = changes.v) != null ? _c : 0))
    };
  };
  var adjustHsl = (color, changes) => {
    var _a, _b, _c;
    return {
      h: wrapHue(color.h + ((_a = changes.h) != null ? _a : 0)),
      s: clamp(color.s + ((_b = changes.s) != null ? _b : 0)),
      l: clamp(color.l + ((_c = changes.l) != null ? _c : 0))
    };
  };
  function toPalette(colors) {
    return Array.from({ length: 13 }, (_, position) => {
      const index = position + 1;
      return { name: `color-${index}`, index, hex: colors[index] };
    });
  }
  function toHslPalette(colors) {
    return Array.from({ length: 13 }, (_, position) => {
      const index = position + 1;
      const hsl = __spreadValues({}, colors[index]);
      return { name: `color-${index}`, index, hex: hslToHex(hsl), hsl };
    });
  }
  function toHsvPalette(colors) {
    return Array.from({ length: 13 }, (_, position) => {
      const index = position + 1;
      const hsv = __spreadValues({}, colors[index]);
      return { name: `color-${index}`, index, hex: hsvToHex(hsv), hsv };
    });
  }
  function generateNeutralLight(baseHex, baseHsl) {
    const base = baseHsl ? adjustHsl(baseHsl, {}) : hexToHsl(baseHex);
    const colors = { 13: base };
    const steps = {
      12: { s: -2, l: 8 },
      11: { s: -2, l: 4 },
      10: { s: -2, l: 3 },
      9: { s: -2, l: 10 },
      8: { s: -2, l: 9 },
      7: { s: -2, l: 18 },
      6: { s: 4, l: 14 }
    };
    for (let index = 12; index >= 6; index -= 1) {
      colors[index] = adjustHsl(colors[index + 1], steps[index]);
    }
    const fixedLightness = base.l <= 5 ? [83, 89, 92, 94] : base.l <= 10 ? [86, 92, 95, 97] : base.l <= 15 ? [88, 93, 96, 98] : base.l <= 20 ? [92, 96, 96, 98] : null;
    if (fixedLightness) {
      for (const [position, index] of [5, 4, 3, 2].entries()) {
        colors[index] = __spreadProps(__spreadValues({}, adjustHsl(colors[index + 1], { s: 4 })), {
          l: fixedLightness[position]
        });
      }
    } else {
      const lightnessSteps = {
        5: 6,
        4: 4,
        3: 2,
        2: 2
      };
      for (let index = 5; index >= 2; index -= 1) {
        colors[index] = adjustHsl(colors[index + 1], {
          s: 4,
          l: lightnessSteps[index]
        });
      }
    }
    colors[1] = { h: base.h, s: 0, l: 100 };
    return toHslPalette(colors);
  }
  function generateNeutralDark(baseHex, baseHsl) {
    const base = baseHsl ? adjustHsl(baseHsl, {}) : hexToHsl(baseHex);
    const isMiddleHue = base.h >= 24 && base.h <= 204;
    const colors = { 13: base };
    const earlyLightness = isMiddleHue ? [3, 3] : [4, 4];
    const steps = {
      12: { s: 0, l: earlyLightness[0] },
      11: { s: 0, l: earlyLightness[1] },
      10: { s: -2, l: 4 },
      9: { s: -2, l: 3 },
      8: { s: isMiddleHue ? -6 : -2, l: isMiddleHue ? 10 : 12 },
      7: { s: -2, l: 10 },
      6: { s: 2, l: 20 }
    };
    for (let index = 12; index >= 6; index -= 1) {
      colors[index] = adjustHsl(colors[index + 1], steps[index]);
    }
    const fixedLightness = base.l <= 5 ? [80, 86, 90, 94] : base.l <= 10 ? [82, 88, 92, 96] : base.l <= 15 ? [84, 90, 94, 98] : base.l <= 20 ? [86, 92, 96, 98] : null;
    const lightnessSteps = {
      5: 10,
      4: 6,
      3: 4,
      2: 2
    };
    for (const [position, index] of [5, 4, 3, 2].entries()) {
      const next = adjustHsl(colors[index + 1], {
        s: index === 5 && !isMiddleHue ? 6 : 4,
        l: fixedLightness ? 0 : lightnessSteps[index]
      });
      colors[index] = fixedLightness ? __spreadProps(__spreadValues({}, next), { l: fixedLightness[position] }) : next;
    }
    colors[1] = { h: base.h, s: 0, l: 100 };
    return toHslPalette(colors);
  }
  function brandLightSaturationRamp(baseSaturation) {
    if (baseSaturation >= 96) return [24, 16, 10, 6];
    if (baseSaturation >= 91) return [20, 14, 8, 4];
    if (baseSaturation >= 86) return [16, 12, 8, 4];
    if (baseSaturation >= 81) return [12, 10, 6, 4];
    if (baseSaturation >= 70) return [10, 8, 6, 4];
    return [8, 6, 4, 2];
  }
  function generateBrandLight(baseHex) {
    const base = rgbToHsv(hexToRgb(baseHex));
    const isMiddleHue = base.h >= 60 && base.h <= 240;
    const darkHueStep = isMiddleHue ? 2 : -2;
    const lightHueStep = -darkHueStep;
    const colors = { 9: base };
    for (let index = 10; index <= 13; index += 1) {
      colors[index] = adjustHsv(colors[index - 1], {
        h: darkHueStep,
        v: -15
      });
    }
    for (let index = 8; index >= 6; index -= 1) {
      colors[index] = adjustHsv(colors[index + 1], {
        h: lightHueStep,
        s: -16,
        v: 4
      });
    }
    colors[5] = adjustHsv(colors[6], {
      h: lightHueStep,
      s: base.s < 65 ? -4 : -16,
      v: 4
    });
    if (base.s >= 65) colors[5].s = Math.max(14, colors[5].s);
    if (base.s < 65) {
      colors[4] = adjustHsv(colors[5], { h: lightHueStep, s: -4, v: 3 });
      colors[3] = adjustHsv(colors[4], { s: -2, v: 3 });
      colors[2] = adjustHsv(colors[3], { s: -2, v: 3 });
      colors[1] = adjustHsv(colors[2], { s: -2, v: 3 });
    } else {
      const saturationRamp = brandLightSaturationRamp(base.s);
      colors[4] = __spreadProps(__spreadValues({}, adjustHsv(colors[5], { h: lightHueStep, v: 3 })), {
        s: saturationRamp[0]
      });
      colors[3] = __spreadProps(__spreadValues({}, adjustHsv(colors[4], { v: 3 })), {
        s: saturationRamp[1]
      });
      colors[2] = __spreadProps(__spreadValues({}, adjustHsv(colors[3], { v: 3 })), {
        s: saturationRamp[2]
      });
      colors[1] = __spreadProps(__spreadValues({}, adjustHsv(colors[2], { v: 3 })), {
        s: saturationRamp[3]
      });
    }
    return toHsvPalette(colors);
  }
  function blend(foreground, background, alpha) {
    const front = hexToRgb(foreground);
    const back = hexToRgb(background);
    return rgbToHex({
      r: front.r * alpha + back.r * (1 - alpha),
      g: front.g * alpha + back.g * (1 - alpha),
      b: front.b * alpha + back.b * (1 - alpha)
    });
  }
  function generateBrandDark(brandHex, neutralBaseHex) {
    const light = Object.fromEntries(
      generateBrandLight(brandHex).map((color) => [color.index, color.hex])
    );
    const composition = {
      13: { source: 5, alpha: 0.98 },
      12: { source: 6, alpha: 0.97 },
      11: { source: 7, alpha: 0.95 },
      10: { source: 8, alpha: 0.9 },
      9: { source: 9, alpha: 0.85 },
      8: { source: 9, alpha: 0.65 },
      7: { source: 9, alpha: 0.45 },
      6: { source: 9, alpha: 0.3 },
      5: { source: 10, alpha: 0.25 },
      4: { source: 10, alpha: 0.2 },
      3: { source: 11, alpha: 0.15 },
      2: { source: 12, alpha: 0.1 },
      1: { source: 13, alpha: 0.05 }
    };
    const colors = Object.fromEntries(
      Object.entries(composition).map(([index, { source, alpha }]) => [
        index,
        blend(light[source], neutralBaseHex, alpha)
      ])
    );
    return toPalette(colors);
  }
  function generatePalette(kind, mode, brandHex, neutralHex, neutralHsl) {
    if (kind === "neutral") {
      return mode === "light" ? generateNeutralLight(neutralHex, neutralHsl) : generateNeutralDark(neutralHex, neutralHsl);
    }
    return mode === "light" ? generateBrandLight(brandHex) : generateBrandDark(brandHex, neutralHex);
  }

  // src/model.ts
  var families = [
    { id: "primary", label: "\u54C1\u724C\u8272", default: "#FF6000" },
    { id: "gray", label: "\u4E2D\u6027\u8272", default: "#0F131A" },
    { id: "success", label: "\u6210\u529F\u8272", default: "#00B23C" },
    { id: "error", label: "\u9519\u8BEF\u8272", default: "#ED182A" },
    { id: "warning", label: "\u8B66\u544A\u8272", default: "#E68200" }
  ];
  function defaults() {
    const colors = () => Object.fromEntries(families.map((f) => [f.id, f.default]));
    return {
      version: 1,
      colors: { light: colors(), dark: colors() },
      sizes: { fontSize: 14, fontWeight: 400, radius: 8, controlHeight: 32, border: 1, sizeUnit: 4, sizeStep: 4, iconOverride: null },
      overrides: {}
    };
  }
  function cloneSettings(settings) {
    return __spreadProps(__spreadValues({}, settings), {
      colors: { light: __spreadValues({}, settings.colors.light), dark: __spreadValues({}, settings.colors.dark) },
      sizes: __spreadValues({}, settings.sizes),
      overrides: __spreadValues({}, settings.overrides)
    });
  }
  function normalizeColor(input) {
    const result = normalizeHex(input);
    if (result) return result;
    const raw = input.trim().replace(/^#/, "");
    if (/^[\da-f]{8}$/i.test(raw)) {
      return `#${raw.slice(0, 6).toUpperCase()}${raw.slice(6).toUpperCase() === "FF" ? "" : raw.slice(6).toUpperCase()}`;
    }
    throw new Error("\u8BF7\u8F93\u5165\u6709\u6548\u7684 HEX \u8272\u503C\uFF0C\u4F8B\u5982 #FF6000 \u6216 FF6000\u3002");
  }
  function channels(hex) {
    const color = normalizeColor(hex);
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1];
  }
  function fromChannels(r, g, b, alpha = 1) {
    const hex = [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
    return normalizeColor(`#${hex}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0")}`);
  }
  function equal(a, b) {
    return a === b;
  }
  function canonicalVariableName(name) {
    return name.replace(/^(light|dark)\//i, (mode) => mode.toLowerCase());
  }
  function tokenId(collection, name) {
    return `${collection}:${canonicalVariableName(name)}`;
  }
  var paletteCache = /* @__PURE__ */ new Map();
  function tokens(settings, ignoreOverrides = false) {
    const result = [];
    const add = (collection, name, group, generated, base = false, mode) => {
      const id = tokenId(collection, name);
      const override = ignoreOverrides ? void 0 : settings.overrides[id];
      const value = override != null ? override : generated;
      result.push({ id, collection, name, label: name.replace(/^(light|dark)\//, "").replace(/\//g, "-"), group, mode, generated, value, base, modified: !equal(value, generated) });
    };
    for (const mode of ["light", "dark"]) {
      for (const family of families) {
        const key = `${mode}:${family.id}`, seed = settings.colors[mode][family.id];
        const neutral = mode === "dark" && family.id !== "gray" ? settings.colors[mode].gray : "";
        let cached = paletteCache.get(key);
        if (!cached || cached.seed !== seed || cached.neutral !== neutral) {
          cached = { seed, neutral, palette: generatePalette(family.id === "gray" ? "neutral" : "brand", mode, seed, settings.colors[mode].gray) };
          paletteCache.set(key, cached);
        }
        const palette = cached.palette;
        for (const color of palette) {
          add(
            "\u68AF\u5EA6\u8272\u677F",
            `${mode}/color-${family.id}/${color.index}`,
            family.id,
            color.hex,
            family.id === "gray" ? color.index === 13 : mode === "light" && color.index === 9,
            mode
          );
        }
      }
    }
    const s = settings.sizes;
    for (const [label, offset] of Object.entries({ "5xl": 18, "4xl": 14, "3xl": 10, "2xl": 6, xl: 4, lg: 2, md: 0, sm: -2, xs: -4 })) {
      add("\u6587\u5B57", `font-size/${label}`, "font-size", s.fontSize + offset, label === "md");
    }
    for (const [label, offset] of Object.entries({ "2xl": 12, xl: 6, lg: 4, md: 4, sm: 2, xs: 0 })) {
      add("\u5C3A\u5BF8", `icon-size/${label}`, "icon-size", s.fontSize + offset + (s.iconOverride === null ? 0 : s.iconOverride - s.fontSize - 4), label === "md");
    }
    for (const [label, offset] of Object.entries({ bold: 200, semibold: 100, medium: 50, regular: 0, light: -50 })) {
      add("\u6587\u5B57", `font-weight/${label}`, "font-weight", s.fontWeight + offset, label === "regular");
    }
    add("radius", "infinite", "radius", 999);
    for (const [label, offset] of Object.entries({ "4xl": 10, "3xl": 8, "2xl": 6, xl: 4, lg: 2, md: 0, sm: -2, xs: -4 })) {
      add("radius", label, "radius", s.radius + offset, label === "md");
    }
    for (const [label, offset] of Object.entries({ "2xl": 16, xl: 8, lg: 4, md: 0, sm: -4, xs: -8 })) {
      add("\u5C3A\u5BF8", `control-height/${label}`, "control-height", s.controlHeight + offset, label === "md");
    }
    add("\u5C3A\u5BF8", "border/width", "border", s.border, true);
    add("\u5C3A\u5BF8", "size-unit", "seed", s.sizeUnit, true);
    add("\u5C3A\u5BF8", "size-step", "seed", s.sizeStep, true);
    for (const [label, n] of Object.entries({ "2xl": 6, xl: 5, lg: 4, md: 3, sm: 2, xs: 1, "2xs": 0 })) {
      add("\u5C3A\u5BF8", `padding/${label}`, "padding", s.sizeUnit + s.sizeStep * n);
    }
    add("\u5C3A\u5BF8", "padding/3xs", "padding", Math.max(0, s.sizeUnit - 2));
    return result;
  }
  function validateNumber(group, value, base = true) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error("\u8BF7\u8F93\u5165\u6709\u9650\u7684\u6574\u6570\u3002");
    if (base && group === "font-size" && (value < 12 || value > 24 || value % 2)) throw new Error("\u5B57\u53F7\u57FA\u51C6\u503C\u5FC5\u987B\u4E3A 12\u201324 \u4E4B\u95F4\u7684\u5076\u6570\u3002");
    if (base && group === "font-weight" && (value < 300 || value > 600)) throw new Error("\u5B57\u91CD\u57FA\u51C6\u503C\u5FC5\u987B\u4E3A 300\u2013600 \u4E4B\u95F4\u7684\u6574\u6570\u3002");
    if (base && group === "radius" && (value < 0 || value > 99)) throw new Error("\u5706\u89D2\u57FA\u51C6\u503C\u5FC5\u987B\u4E3A 0\u201399 \u4E4B\u95F4\u7684\u6574\u6570\u3002");
    if ((group === "control-height" || group === "icon-size") && base && value <= 0) throw new Error("\u5C3A\u5BF8\u57FA\u51C6\u503C\u5FC5\u987B\u4E3A\u6B63\u6574\u6570\u3002");
    if (["border", "size-unit", "size-step", "padding"].includes(group) && value < 0) throw new Error("\u63CF\u8FB9\u3001\u57FA\u7840\u5355\u4F4D\u3001\u6B65\u957F\u548C\u95F4\u8DDD\u4E0D\u80FD\u4E3A\u8D1F\u6570\u3002");
  }
  var sizeKeys = {
    "font-size": "fontSize",
    "font-weight": "fontWeight",
    radius: "radius",
    "control-height": "controlHeight",
    border: "border",
    "size-unit": "sizeUnit",
    "size-step": "sizeStep",
    "icon-size": "iconOverride"
  };
  function apply(settings, action) {
    if (action.type === "color-seed") {
      if (!["light", "dark"].includes(action.mode) || !families.some((f) => f.id === action.family)) throw new Error("\u65E0\u6548\u7684\u989C\u8272\u5206\u7EC4\u3002");
      const color = normalizeColor(action.value);
      if (color.length === 9) throw new Error("\u989C\u8272\u57FA\u51C6\u503C\u4E0D\u652F\u6301\u900F\u660E\u5EA6\uFF0C\u8BF7\u8BBE\u4E3A 100%\u3002");
      settings.colors[action.mode][action.family] = color;
    } else if (action.type === "size-seed") {
      if (action.group !== "padding" && !(action.group in sizeKeys)) throw new Error("\u65E0\u6548\u7684\u5C3A\u5BF8\u5206\u7EC4\u3002");
      validateNumber(action.group, action.value);
      if (action.group === "padding") throw new Error("\u8BF7\u5206\u522B\u8BBE\u7F6E size-unit \u548C size-step\u3002");
      settings.sizes[sizeKeys[action.group]] = action.value;
    } else if (action.type === "reset-icon") {
      settings.sizes.iconOverride = null;
    } else {
      const token = tokens(settings).find((t) => t.id === action.id);
      if (!token) throw new Error("\u672A\u627E\u5230\u5BF9\u5E94\u53D8\u91CF\u3002");
      if (action.type === "reset") {
        if (token.base) throw new Error("\u57FA\u51C6\u503C\u4E0D\u80FD\u91CD\u7F6E\u3002");
        delete settings.overrides[token.id];
      } else if (token.base) {
        if (token.mode) {
          if (typeof action.value !== "string") throw new Error("\u989C\u8272\u503C\u7C7B\u578B\u9519\u8BEF\u3002");
          apply(settings, { type: "color-seed", mode: token.mode, family: token.group, value: action.value });
        } else {
          if (typeof action.value !== "number") throw new Error("\u5C3A\u5BF8\u503C\u7C7B\u578B\u9519\u8BEF\u3002");
          apply(settings, { type: "size-seed", group: token.group === "seed" ? token.name : token.group, value: action.value });
        }
      } else {
        if (typeof token.generated === "string") {
          if (typeof action.value !== "string") throw new Error("\u989C\u8272\u503C\u7C7B\u578B\u9519\u8BEF\u3002");
          settings.overrides[token.id] = normalizeColor(action.value);
        } else {
          if (typeof action.value !== "number") throw new Error("\u5C3A\u5BF8\u503C\u7C7B\u578B\u9519\u8BEF\u3002");
          validateNumber(token.group, action.value, false);
          if (token.name === "infinite" && action.value !== 999) throw new Error("radius-infinite \u56FA\u5B9A\u4E3A 999\u3002");
          settings.overrides[token.id] = action.value;
        }
        if (equal(settings.overrides[token.id], token.generated)) delete settings.overrides[token.id];
      }
    }
  }
  function darkSeed(color, neutral) {
    const front = channels(color), back = channels(neutral);
    return fromChannels((front[0] - back[0] * 0.15) / 0.85, (front[1] - back[1] * 0.15) / 0.85, (front[2] - back[2] * 0.15) / 0.85);
  }
  function hydrate(settings, actual, previous) {
    const changed = (id) => actual.has(id) && (!previous || !equal(actual.get(id), previous.get(id)));
    const before = tokens(settings);
    for (const t of before.filter((t2) => t2.base && changed(t2.id))) {
      const value = actual.get(t.id);
      apply(settings, { type: "token", id: t.id, value });
    }
    const expected = tokens(settings, true);
    for (const family of families.filter((f) => f.id !== "gray")) {
      const token = expected.find((t) => t.mode === "dark" && t.group === family.id && t.name.endsWith("/9"));
      if (changed(token.id) && typeof actual.get(token.id) === "string" && !equal(actual.get(token.id), token.generated)) {
        settings.colors.dark[family.id] = darkSeed(String(actual.get(token.id)), settings.colors.dark.gray);
      }
    }
    for (const t of tokens(settings, true)) {
      if (!t.base && changed(t.id)) {
        const value = actual.get(t.id);
        if (typeof value !== typeof t.generated) throw new Error(`${t.name} \u7684\u53D8\u91CF\u7C7B\u578B\u4E0D\u6B63\u786E\u3002`);
        if (typeof value === "number") {
          validateNumber(t.group, value, false);
          if (t.name === "infinite" && value !== 999) throw new Error("\u5DF2\u6709 radius-infinite \u5FC5\u987B\u4E3A 999\uFF0C\u8BF7\u5728 Figma \u4E2D\u4FEE\u6B63\u3002");
        }
        if (equal(value, t.generated)) delete settings.overrides[t.id];
        else settings.overrides[t.id] = value;
      }
    }
    if (!previous && settings.sizes.iconOverride === settings.sizes.fontSize + 4) settings.sizes.iconOverride = null;
  }
  function readSettings(raw) {
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || parsed.version !== 1) throw new Error("\u5DF2\u4FDD\u5B58\u7684\u914D\u7F6E\u683C\u5F0F\u65E0\u6548\u3002");
    const result = parsed;
    for (const mode of ["light", "dark"]) {
      for (const f of families) apply(result, { type: "color-seed", mode, family: f.id, value: result.colors[mode][f.id] });
    }
    for (const [group, key] of Object.entries(sizeKeys)) {
      if (key === "iconOverride" && result.sizes.iconOverride === null) continue;
      const value = result.sizes[key];
      if (typeof value !== "number") throw new Error("\u5DF2\u4FDD\u5B58\u7684\u5C3A\u5BF8\u503C\u65E0\u6548\u3002");
      validateNumber(group, value);
    }
    if (typeof result.overrides !== "object" || result.overrides === null) throw new Error("\u5DF2\u4FDD\u5B58\u7684\u8986\u76D6\u503C\u65E0\u6548\u3002");
    const savedOverrides = Object.entries(result.overrides);
    result.overrides = {};
    for (const [id, value] of savedOverrides) {
      const canonicalId = id.replace(/^(梯度色板:)(light|dark)\//i, (_, collection, mode) => `${collection}${mode.toLowerCase()}/`);
      if (canonicalId in result.overrides && !equal(result.overrides[canonicalId], value)) throw new Error("\u5DF2\u4FDD\u5B58\u7684 Light/Dark \u8986\u76D6\u503C\u5B58\u5728\u5927\u5C0F\u5199\u91CD\u540D\u51B2\u7A81\u3002");
      result.overrides[canonicalId] = value;
    }
    for (const [id, value] of Object.entries(result.overrides)) apply(result, { type: "token", id, value });
    return result;
  }

  // src/sync.ts
  var storageKey = "theme-configurator-v1";
  var Synchronizer = class {
    constructor(api) {
      this.api = api;
      this.settings = defaults();
      this.definitions = tokens(defaults());
      this.saved = "";
    }
    async read() {
      const [collections, variables] = await Promise.all([
        this.api.variables.getLocalVariableCollectionsAsync(),
        this.api.variables.getLocalVariablesAsync()
      ]);
      const wanted = this.definitions;
      const names = new Set(wanted.map((t) => t.collection));
      const collectionMap = /* @__PURE__ */ new Map();
      const collectionById = /* @__PURE__ */ new Map();
      const metadata = /* @__PURE__ */ new Map();
      for (const c of collections) {
        const name = c.name, id = c.id;
        collectionById.set(id, c);
        if (!names.has(name)) continue;
        if (collectionMap.has(name)) throw new Error(`\u5B58\u5728\u591A\u4E2A\u201C${name}\u201D\u96C6\u5408\uFF0C\u8BF7\u4FDD\u7559\u4E00\u4E2A\u5BF9\u5E94\u96C6\u5408\u540E\u91CD\u8BD5\u3002`);
        collectionMap.set(name, c);
        metadata.set(name, { id, modeId: c.defaultModeId });
      }
      const wantedKeys = new Set(wanted.flatMap((t) => {
        const c = metadata.get(t.collection);
        return c ? [`${c.id}:${t.name}`] : [];
      }));
      const variableIndex = /* @__PURE__ */ new Map();
      const managedIds = new Set([...metadata.values()].map((c) => c.id));
      for (const variable of variables) {
        const collectionId = variable.variableCollectionId;
        if (!managedIds.has(collectionId)) continue;
        const key = `${collectionId}:${canonicalVariableName(variable.name)}`;
        if (!wantedKeys.has(key)) continue;
        if (variableIndex.has(key)) throw new Error(`\u201C${variable.name}\u201D\u6709\u91CD\u590D\u53D8\u91CF\uFF0C\u8BF7\u5148\u5904\u7406\u91CD\u540D\u53D8\u91CF\u3002`);
        variableIndex.set(key, variable);
      }
      const variableMap = /* @__PURE__ */ new Map(), actual = /* @__PURE__ */ new Map();
      const resolve = async (variable, modeId, seen = /* @__PURE__ */ new Set()) => {
        var _a;
        const id = variable.id;
        if (seen.has(id)) throw new Error(`\u53D8\u91CF ${variable.name} \u5B58\u5728\u5FAA\u73AF\u5F15\u7528\u3002`);
        seen.add(id);
        const value = variable.valuesByMode[modeId];
        if (value === void 0) throw new Error(`\u53D8\u91CF ${variable.name} \u7684\u9ED8\u8BA4\u6A21\u5F0F\u6CA1\u6709\u503C\u3002`);
        if (typeof value === "object" && "type" in value && value.type === "VARIABLE_ALIAS") {
          const target = await this.api.variables.getVariableByIdAsync(value.id);
          if (!target) throw new Error(`\u53D8\u91CF ${variable.name} \u7684\u5F15\u7528\u65E0\u6CD5\u8BFB\u53D6\u3002`);
          const targetCollectionId = target.variableCollectionId;
          const c = (_a = collectionById.get(targetCollectionId)) != null ? _a : await this.api.variables.getVariableCollectionByIdAsync(targetCollectionId);
          if (!c) throw new Error(`\u65E0\u6CD5\u8BFB\u53D6\u5F15\u7528\u53D8\u91CF ${target.name} \u6240\u5728\u96C6\u5408\u3002`);
          return resolve(target, c.modes.some((m) => m.modeId === modeId) ? modeId : c.defaultModeId, seen);
        }
        if (typeof value === "number") {
          if (!Number.isFinite(value)) throw new Error(`\u53D8\u91CF ${variable.name} \u4E0D\u662F\u6709\u9650\u6570\u503C\u3002`);
          return value;
        }
        if (typeof value === "object" && "r" in value) return fromChannels(value.r * 255, value.g * 255, value.b * 255, "a" in value ? value.a : 1);
        throw new Error(`\u53D8\u91CF ${variable.name} \u7684\u7C7B\u578B\u4E0D\u53D7\u652F\u6301\u3002`);
      };
      for (const t of wanted) {
        const c = metadata.get(t.collection);
        if (!c) continue;
        const variable = variableIndex.get(`${c.id}:${t.name}`);
        if (!variable) continue;
        if (variable.resolvedType !== (typeof t.value === "string" ? "COLOR" : "FLOAT")) throw new Error(`\u201C${t.collection}/${t.name}\u201D\u53D8\u91CF\u7C7B\u578B\u4E0D\u5339\u914D\u3002`);
        variableMap.set(t.id, variable);
        actual.set(t.id, await resolve(variable, c.modeId));
      }
      return { collections: collectionMap, variables: variableMap, actual, modes: new Map([...metadata].map(([name, c]) => [name, c.modeId])) };
    }
    async initialize() {
      if (!this.api.pluginId) throw new Error("\u63D2\u4EF6\u7F3A\u5C11 ID\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u6587\u4EF6\u914D\u7F6E\u3002\u8BF7\u91CD\u65B0\u5BFC\u5165\u672C\u5730 manifest.json\uFF0C\u518D\u8FD0\u884C\u63D2\u4EF6\u3002");
      this.saved = this.api.root.getPluginData(storageKey);
      this.settings = readSettings(this.saved);
      this.inventory = await this.read();
      hydrate(this.settings, this.inventory.actual);
      this.previous = new Map(this.inventory.actual);
      this.persist();
      return this.snapshot();
    }
    persist() {
      const serialized = JSON.stringify(this.settings);
      if (serialized === this.saved) return;
      this.api.root.setPluginData(storageKey, serialized);
      this.saved = serialized;
    }
    snapshot(all = tokens(this.settings)) {
      var _a, _b;
      const existing = (_b = (_a = this.inventory) == null ? void 0 : _a.variables.size) != null ? _b : 0;
      return { settings: this.settings, tokens: all, existing, total: all.length, complete: existing === all.length };
    }
    writeToken(t, variable, modeId) {
      if (typeof t.value === "number") variable.setValueForMode(modeId, t.value);
      else {
        const [r, g, b, a] = channels(t.value);
        variable.setValueForMode(modeId, { r: r / 255, g: g / 255, b: b / 255, a });
      }
    }
    async write(create) {
      if (!this.inventory) throw new Error("\u63D2\u4EF6\u5C1A\u672A\u521D\u59CB\u5316\u3002");
      const all = tokens(this.settings);
      for (const t of all) {
        let c = this.inventory.collections.get(t.collection);
        if (!c && create) {
          c = this.api.variables.createVariableCollection(t.collection);
          this.inventory.collections.set(t.collection, c);
          this.inventory.modes.set(t.collection, c.defaultModeId);
        }
        if (!c) continue;
        let v = this.inventory.variables.get(t.id);
        if (!v && create) {
          v = this.api.variables.createVariable(t.name, c, typeof t.value === "string" ? "COLOR" : "FLOAT");
          v.description = `${t.label} \xB7 \u4E3B\u9898\u5316\u914D\u7F6E\u5668`;
          this.inventory.variables.set(t.id, v);
        }
        if (v && !equal(this.inventory.actual.get(t.id), t.value)) {
          const modeId = this.inventory.modes.get(t.collection);
          if (!modeId) throw new Error(`\u65E0\u6CD5\u8BFB\u53D6\u201C${t.collection}\u201D\u96C6\u5408\u7684\u9ED8\u8BA4\u6A21\u5F0F\u3002`);
          this.writeToken(t, v, modeId);
          this.inventory.actual.set(t.id, t.value);
        }
      }
      this.previous = new Map(this.inventory.actual);
      this.persist();
      return all;
    }
    async refresh() {
      const next = await this.read();
      const changed = !this.previous || next.actual.size !== this.previous.size || [...next.actual].some(([id, value]) => !equal(value, this.previous.get(id)));
      this.inventory = next;
      if (!changed) return null;
      const candidate = cloneSettings(this.settings);
      hydrate(candidate, next.actual, this.previous);
      this.settings = candidate;
      return this.snapshot(await this.write(false));
    }
    async act(action) {
      return this.actMany([action]);
    }
    async actMany(actions) {
      if (!actions.length) throw new Error("\u6CA1\u6709\u5F85\u540C\u6B65\u7684\u4FEE\u6539\u3002");
      await this.refresh();
      const candidate = cloneSettings(this.settings);
      for (const action of actions) apply(candidate, action);
      this.settings = candidate;
      return this.snapshot(await this.write(false));
    }
    async generate() {
      await this.refresh();
      return this.snapshot(await this.write(true));
    }
  };

  // src/main.ts
  figma.showUI(__html__, { width: 400, height: 580, title: "\u4E3B\u9898\u5316\u914D\u7F6E\u5668", themeColors: false });
  var sync = new Synchronizer(figma);
  var chain = Promise.resolve();
  var pending = 0;
  var initialized = false;
  var lastError = "";
  var send = (message) => figma.ui.postMessage(message);
  function acknowledgement(requestIds) {
    return (requestIds == null ? void 0 : requestIds.length) === 1 ? { requestId: requestIds[0] } : (requestIds == null ? void 0 : requestIds.length) ? { requestIds } : {};
  }
  function run(work, requestIds) {
    pending++;
    chain = chain.then(async () => {
      try {
        await work();
        lastError = "";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[\u4E3B\u9898\u5316\u914D\u7F6E\u5668]", error);
        send(__spreadValues({ type: "error", message }, acknowledgement(requestIds)));
        if (lastError !== message) figma.notify(message, { error: true, timeout: 6e3 });
        lastError = message;
      } finally {
        pending--;
      }
    });
  }
  figma.ui.onmessage = (message) => {
    if (message.type === "close") {
      figma.closePlugin();
      return;
    }
    if (message.type === "resize") {
      if (Number.isFinite(message.height)) figma.ui.resize(400, Math.max(360, Math.min(764, message.height)));
      return;
    }
    run(async () => {
      if (!initialized) {
        const snapshot = await sync.initialize();
        initialized = true;
        if (message.type === "ready") {
          send({ type: "snapshot", snapshot });
          return;
        }
      }
      if (message.type === "action") send({ type: "snapshot", snapshot: await sync.act(message.action), requestId: message.requestId });
      else if (message.type === "actions") send(__spreadValues({
        type: "snapshot",
        snapshot: await sync.actMany(message.requests.map((r) => r.action))
      }, acknowledgement(message.requests.map((r) => r.requestId))));
      else if (message.type === "generate") {
        const snapshot = await sync.generate();
        send({ type: "snapshot", snapshot });
        send({ type: "generated", count: snapshot.total });
        figma.notify(`\u5DF2\u751F\u6210\u5168\u90E8 ${snapshot.total} \u4E2A\u53D8\u91CF\uFF0C\u540E\u7EED\u4FEE\u6539\u5C06\u5B9E\u65F6\u540C\u6B65\u3002`);
      } else if (message.type === "ready") send({ type: "snapshot", snapshot: sync.snapshot() });
    }, message.type === "action" ? [message.requestId] : message.type === "actions" ? message.requests.map((r) => r.requestId) : void 0);
  };
  var timer = setInterval(() => {
    if (!initialized || pending) return;
    run(async () => {
      const snapshot = await sync.refresh();
      if (snapshot) send({ type: "snapshot", snapshot });
    });
  }, 800);
  figma.on("close", () => clearInterval(timer));
})();
