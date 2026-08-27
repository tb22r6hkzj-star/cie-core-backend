function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function evaluateBenchmarkReadinessV1(catalog = {}) {
  const minimum = Math.max(1, Number(catalog?.minimum_adjudicated_images || 100));
  const samples = asArray(catalog?.samples);
  const seedCases = asArray(catalog?.seed_cases);
  const adjudicated = samples.filter((sample) => sample?.annotation_status === "adjudicated" && sample?.image_uri);
  const cells = asArray(catalog?.required_cells).map((cell) => {
    const axes = new Set(asArray(cell?.axes).map(String));
    const matches = adjudicated.filter((sample) => {
      const sampleAxes = new Set(asArray(sample?.benchmark_axes).map(String));
      return [...axes].every((axis) => sampleAxes.has(axis));
    });
    const required = Math.max(0, Number(cell?.minimum || 0));
    return { id: String(cell?.id || "unknown"), required, completed: matches.length, remaining: Math.max(0, required - matches.length) };
  });
  const physicalReferences = adjudicated.filter((sample) => sample?.metadata?.physical_reference?.instrument && sample?.metadata?.physical_reference?.lab).length;
  const ready = adjudicated.length >= minimum && cells.every((cell) => cell.remaining === 0);
  return {
    version: "benchmark_readiness_v1",
    ready,
    minimum_adjudicated_images: minimum,
    adjudicated_image_count: adjudicated.length,
    remaining_image_count: Math.max(0, minimum - adjudicated.length),
    physical_reference_count: physicalReferences,
    seed_case_count: seedCases.length,
    seed_cases_are_not_benchmark_samples: true,
    cells,
    blockers: [
      ...(adjudicated.length < minimum ? ["insufficient_adjudicated_images"] : []),
      ...(cells.some((cell) => cell.remaining > 0) ? ["required_coverage_cells_incomplete"] : []),
      ...(physicalReferences === 0 ? ["no_physical_color_ground_truth"] : []),
    ],
  };
}
