// src/services/paletteEngineV2.js

const chroma = require("chroma-js");

/*
 V2 Palette Engine
 - Mode separation enforcement
 - Tonal expansion layer
 - Vivid color handling
 - Score-driven architecture
*/

function generatePaletteV2(hex) {
  const base = chroma(hex);
  const hsl = base.hsl();
  const saturation = hsl[1];
  const lightness = hsl[2];

  const isVivid = saturation > 0.7;
  const isDark = lightness < 0.4;
  const isLight = lightness > 0.7;

  return {
    balance: buildBalance(base),
    contrast: buildContrast(base),
    cohesion: buildCohesion(base),
    emphasis: buildEmphasis(base, isVivid),
    natural: buildNatural(base),
    explore: buildExplore(base)
  };
}

function buildBalance(base) {
  return chroma.scale(["#111111", "#2B2B2B", "#7A7A7A", "#CFCFCF", "#F5F1E8"])
    .mode("lab")
    .colors(5);
}

function buildContrast(base) {
  const complement = base.set("hsl.h", "+180");
  return [complement.hex()];
}

function buildCohesion(base) {
  return [
    base.brighten(0.5).hex(),
    base.darken(0.5).hex(),
    base.desaturate(0.5).hex()
  ];
}

function buildEmphasis(base, isVivid) {
  if (isVivid) {
    return [
      base.set("hsl.h", "+200").hex(),
      base.set("hsl.h", "-200").hex()
    ];
  }

  return [
    base.saturate(1).hex(),
    base.set("hsl.h", "+150").hex()
  ];
}

function buildNatural(base) {
  return [
    chroma.mix(base, "#556B2F", 0.5).hex(),
    chroma.mix(base, "#8B4513", 0.4).hex()
  ];
}

function buildExplore(base) {
  return [
    base.set("hsl.h", "+90").hex(),
    base.set("hsl.h", "-90").hex(),
    base.set("hsl.h", "+45").hex()
  ];
}

module.exports = { generatePaletteV2 };