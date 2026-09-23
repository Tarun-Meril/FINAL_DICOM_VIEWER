/**
 * VesselTree Subsystem
 * Tree data structure representing vascular branching networks and lumen diameters
 */

export interface IVesselTreeNode {
  id: string;
  point: [number, number, number];
  radius: number;
  children: IVesselTreeNode[];
}

export class VesselTree {
  public root: IVesselTreeNode | null = null;

  constructor(rootNode?: IVesselTreeNode) {
    this.root = rootNode || null;
  }
}
