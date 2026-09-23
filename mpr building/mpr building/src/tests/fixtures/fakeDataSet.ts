/**
 * Minimal stand-in for a dicom-parser DataSet, so the Enhanced multi-frame
 * functional-group resolution can be tested without shipping binary fixtures.
 * It implements exactly the surface the parser adapter uses.
 */

export class FakeDataSet {
  readonly elements: Record<string, { items?: Array<{ dataSet: FakeDataSet }> }> = {};

  constructor(
    private readonly values: Record<string, string> = {},
    sequences: Record<string, FakeDataSet[]> = {},
  ) {
    for (const tag of Object.keys(values)) this.elements[tag] = {};
    for (const [tag, items] of Object.entries(sequences)) {
      this.elements[tag] = { items: items.map((dataSet) => ({ dataSet })) };
    }
  }

  string(tag: string): string | undefined {
    return this.values[tag];
  }

  floatString(tag: string, index = 0): number | undefined {
    const raw = this.values[tag];
    if (raw === undefined) return undefined;
    const parts = raw.split('\\');
    if (index >= parts.length) return undefined;
    const v = parseFloat(parts[index]);
    return Number.isFinite(v) ? v : undefined;
  }

  intString(tag: string, index = 0): number | undefined {
    const v = this.floatString(tag, index);
    return v === undefined ? undefined : Math.trunc(v);
  }

  uint16(tag: string): number | undefined {
    return this.intString(tag);
  }
}
