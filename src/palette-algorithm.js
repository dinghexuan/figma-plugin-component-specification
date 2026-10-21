// Standalone ES Module version of the palette generator in src/color.ts.

const clamp = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value))

const wrapHue = (hue) => ((hue % 360) + 360) % 360

export function normalizeHex(value) {
  const normalized = value.trim().replace(/^#/, '')
  if (/^[\da-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .split('')
      .map((character) => character.repeat(2))
      .join('')
      .toUpperCase()}`
  }
  if (/^[\da-f]{6}$/i.test(normalized)) {
    return `#${normalized.toUpperCase()}`
  }
  return null
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex)
  if (!normalized) {
    throw new Error(`Invalid hex color: ${hex}`)
  }
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) =>
      Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`
}

export function rgbToHsv({ r, g, b }) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let h = 0

  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6)
    else if (max === green) h = 60 * ((blue - red) / delta + 2)
    else h = 60 * ((red - green) / delta + 4)
  }

  return {
    h: wrapHue(h),
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  }
}

function hsvToRgb({ h, s, v }) {
  const hue = wrapHue(h)
  const saturation = clamp(s) / 100
  const value = clamp(v) / 100
  const chroma = value * saturation
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = value - chroma
  let rgb

  if (hue < 60) rgb = [chroma, x, 0]
  else if (hue < 120) rgb = [x, chroma, 0]
  else if (hue < 180) rgb = [0, chroma, x]
  else if (hue < 240) rgb = [0, x, chroma]
  else if (hue < 300) rgb = [x, 0, chroma]
  else rgb = [chroma, 0, x]

  return {
    r: (rgb[0] + m) * 255,
    g: (rgb[1] + m) * 255,
    b: (rgb[2] + m) * 255,
  }
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2
  let h = 0

  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6)
    else if (max === green) h = 60 * ((blue - red) / delta + 2)
    else h = 60 * ((red - green) / delta + 4)
  }

  return {
    h: wrapHue(h),
    s:
      delta === 0
        ? 0
        : (delta / (1 - Math.abs(2 * lightness - 1))) * 100,
    l: lightness * 100,
  }
}

function hslToRgb({ h, s, l }) {
  const hue = wrapHue(h)
  const saturation = clamp(s) / 100
  const lightness = clamp(l) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lightness - chroma / 2
  let rgb

  if (hue < 60) rgb = [chroma, x, 0]
  else if (hue < 120) rgb = [x, chroma, 0]
  else if (hue < 180) rgb = [0, chroma, x]
  else if (hue < 240) rgb = [0, x, chroma]
  else if (hue < 300) rgb = [x, 0, chroma]
  else rgb = [chroma, 0, x]

  return {
    r: (rgb[0] + m) * 255,
    g: (rgb[1] + m) * 255,
    b: (rgb[2] + m) * 255,
  }
}

export const hexToHsv = (hex) => rgbToHsv(hexToRgb(hex))
export const hexToHsl = (hex) => rgbToHsl(hexToRgb(hex))
export const hsvToHex = (color) => rgbToHex(hsvToRgb(color))
export const hslToHex = (color) => rgbToHex(hslToRgb(color))

const adjustHsv = (color, changes) => ({
  h: wrapHue(color.h + (changes.h ?? 0)),
  s: clamp(color.s + (changes.s ?? 0)),
  v: clamp(color.v + (changes.v ?? 0)),
})

const adjustHsl = (color, changes) => ({
  h: wrapHue(color.h + (changes.h ?? 0)),
  s: clamp(color.s + (changes.s ?? 0)),
  l: clamp(color.l + (changes.l ?? 0)),
})

function toPalette(colors) {
  return Array.from({ length: 13 }, (_, position) => {
    const index = position + 1
    return { name: `color-${index}`, index, hex: colors[index] }
  })
}

function toHslPalette(colors) {
  return Array.from({ length: 13 }, (_, position) => {
    const index = position + 1
    const hsl = { ...colors[index] }
    return { name: `color-${index}`, index, hex: hslToHex(hsl), hsl }
  })
}

function toHsvPalette(colors) {
  return Array.from({ length: 13 }, (_, position) => {
    const index = position + 1
    const hsv = { ...colors[index] }
    return { name: `color-${index}`, index, hex: hsvToHex(hsv), hsv }
  })
}

export function generateNeutralLight(baseHex, baseHsl) {
  const base = baseHsl ? adjustHsl(baseHsl, {}) : hexToHsl(baseHex)
  const colors = { 13: base }
  const steps = {
    12: { s: -2, l: 8 },
    11: { s: -2, l: 4 },
    10: { s: -2, l: 3 },
    9: { s: -2, l: 10 },
    8: { s: -2, l: 9 },
    7: { s: -2, l: 18 },
    6: { s: 4, l: 14 },
  }

  for (let index = 12; index >= 6; index -= 1) {
    colors[index] = adjustHsl(colors[index + 1], steps[index])
  }

  const fixedLightness =
    base.l <= 5
      ? [83, 89, 92, 94]
      : base.l <= 10
        ? [86, 92, 95, 97]
        : base.l <= 15
          ? [88, 93, 96, 98]
          : base.l <= 20
            ? [92, 96, 96, 98]
            : null

  if (fixedLightness) {
    for (const [position, index] of [5, 4, 3, 2].entries()) {
      colors[index] = {
        ...adjustHsl(colors[index + 1], { s: 4 }),
        l: fixedLightness[position],
      }
    }
  } else {
    const lightnessSteps = {
      5: 6,
      4: 4,
      3: 2,
      2: 2,
    }
    for (let index = 5; index >= 2; index -= 1) {
      colors[index] = adjustHsl(colors[index + 1], {
        s: 4,
        l: lightnessSteps[index],
      })
    }
  }

  colors[1] = { h: base.h, s: 0, l: 100 }
  return toHslPalette(colors)
}

export function generateNeutralDark(baseHex, baseHsl) {
  const base = baseHsl ? adjustHsl(baseHsl, {}) : hexToHsl(baseHex)
  const isMiddleHue = base.h >= 24 && base.h <= 204
  const colors = { 13: base }
  const earlyLightness = isMiddleHue ? [3, 3] : [4, 4]
  const steps = {
    12: { s: 0, l: earlyLightness[0] },
    11: { s: 0, l: earlyLightness[1] },
    10: { s: -2, l: 4 },
    9: { s: -2, l: 3 },
    8: { s: isMiddleHue ? -6 : -2, l: isMiddleHue ? 10 : 12 },
    7: { s: -2, l: 10 },
    6: { s: 2, l: 20 },
  }

  for (let index = 12; index >= 6; index -= 1) {
    colors[index] = adjustHsl(colors[index + 1], steps[index])
  }

  const fixedLightness =
    base.l <= 5
      ? [80, 86, 90, 94]
      : base.l <= 10
        ? [82, 88, 92, 96]
        : base.l <= 15
          ? [84, 90, 94, 98]
          : base.l <= 20
            ? [86, 92, 96, 98]
            : null
  const lightnessSteps = {
    5: 10,
    4: 6,
    3: 4,
    2: 2,
  }

  for (const [position, index] of [5, 4, 3, 2].entries()) {
    const next = adjustHsl(colors[index + 1], {
      s: index === 5 && !isMiddleHue ? 6 : 4,
      l: fixedLightness ? 0 : lightnessSteps[index],
    })
    colors[index] = fixedLightness
      ? { ...next, l: fixedLightness[position] }
      : next
  }

  colors[1] = { h: base.h, s: 0, l: 100 }
  return toHslPalette(colors)
}

function brandLightSaturationRamp(baseSaturation) {
  if (baseSaturation >= 96) return [24, 16, 10, 6]
  if (baseSaturation >= 91) return [20, 14, 8, 4]
  if (baseSaturation >= 86) return [16, 12, 8, 4]
  if (baseSaturation >= 81) return [12, 10, 6, 4]
  if (baseSaturation >= 70) return [10, 8, 6, 4]
  return [8, 6, 4, 2]
}

export function generateBrandLight(baseHex) {
  const base = rgbToHsv(hexToRgb(baseHex))
  const isMiddleHue = base.h >= 60 && base.h <= 240
  const darkHueStep = isMiddleHue ? 2 : -2
  const lightHueStep = -darkHueStep
  const colors = { 9: base }

  for (let index = 10; index <= 13; index += 1) {
    colors[index] = adjustHsv(colors[index - 1], {
      h: darkHueStep,
      v: -15,
    })
  }

  for (let index = 8; index >= 6; index -= 1) {
    colors[index] = adjustHsv(colors[index + 1], {
      h: lightHueStep,
      s: -16,
      v: 4,
    })
  }

  colors[5] = adjustHsv(colors[6], {
    h: lightHueStep,
    s: base.s < 65 ? -4 : -16,
    v: 4,
  })
  if (base.s >= 65) colors[5].s = Math.max(14, colors[5].s)

  if (base.s < 65) {
    colors[4] = adjustHsv(colors[5], { h: lightHueStep, s: -4, v: 3 })
    colors[3] = adjustHsv(colors[4], { s: -2, v: 3 })
    colors[2] = adjustHsv(colors[3], { s: -2, v: 3 })
    colors[1] = adjustHsv(colors[2], { s: -2, v: 3 })
  } else {
    const saturationRamp = brandLightSaturationRamp(base.s)
    colors[4] = {
      ...adjustHsv(colors[5], { h: lightHueStep, v: 3 }),
      s: saturationRamp[0],
    }
    colors[3] = {
      ...adjustHsv(colors[4], { v: 3 }),
      s: saturationRamp[1],
    }
    colors[2] = {
      ...adjustHsv(colors[3], { v: 3 }),
      s: saturationRamp[2],
    }
    colors[1] = {
      ...adjustHsv(colors[2], { v: 3 }),
      s: saturationRamp[3],
    }
  }

  return toHsvPalette(colors)
}

function blend(foreground, background, alpha) {
  const front = hexToRgb(foreground)
  const back = hexToRgb(background)
  return rgbToHex({
    r: front.r * alpha + back.r * (1 - alpha),
    g: front.g * alpha + back.g * (1 - alpha),
    b: front.b * alpha + back.b * (1 - alpha),
  })
}

export function generateBrandDark(brandHex, neutralBaseHex) {
  const light = Object.fromEntries(
    generateBrandLight(brandHex).map((color) => [color.index, color.hex]),
  )
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
    1: { source: 13, alpha: 0.05 },
  }
  const colors = Object.fromEntries(
    Object.entries(composition).map(([index, { source, alpha }]) => [
      index,
      blend(light[source], neutralBaseHex, alpha),
    ]),
  )
  return toPalette(colors)
}

export function generatePalette(
  kind,
  mode,
  brandHex,
  neutralHex,
  neutralHsl,
) {
  if (kind === 'neutral') {
    return mode === 'light'
      ? generateNeutralLight(neutralHex, neutralHsl)
      : generateNeutralDark(neutralHex, neutralHsl)
  }
  return mode === 'light'
    ? generateBrandLight(brandHex)
    : generateBrandDark(brandHex, neutralHex)
}

export function getContrastColor(hex) {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.62 ? '#0F131A' : '#FFFFFF'
}
