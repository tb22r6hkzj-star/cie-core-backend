from pathlib import Path

p=Path('src/server.js')
s=p.read_text()
old='''  const supportDescriptor = `${supportTraits.intensity || "balanced"} ${support?.name || support?.hex || "support tone"}`;
  const stabilizerDescriptor = `${stabilizerTraits.intensity || "balanced"} ${stabilizer?.name || stabilizer?.hex || "stabilizer tone"}`;
  const accentDescriptor = `${accentTraits.intensity || "balanced"} ${accent?.name || accent?.hex || "accent tone"}`;
'''
new='''  const buildRoleDescriptor = (descriptor, colorName, fallbackName) => {
    const prefix = String(descriptor || "").trim();
    const name = String(colorName || fallbackName || "tone").trim();
    if (!prefix) return name;
    const normalizedPrefix = prefix.toLowerCase();
    const normalizedName = name.toLowerCase();
    return normalizedName === normalizedPrefix || normalizedName.startsWith(`${normalizedPrefix} `)
      ? name
      : `${prefix} ${name}`;
  };

  const supportDescriptor = buildRoleDescriptor(supportTraits.intensity || "balanced", support?.name || support?.hex, "support tone");
  const stabilizerDescriptor = buildRoleDescriptor(stabilizerTraits.intensity || "balanced", stabilizer?.name || stabilizer?.hex, "stabilizer tone");
  const accentDescriptor = buildRoleDescriptor(accentTraits.intensity || "balanced", accent?.name || accent?.hex, "accent tone");
'''
if old not in s:
    raise SystemExit('buildWhyThisWorks descriptor block not found')
s=s.replace(old,new,1)
p.write_text(s)
