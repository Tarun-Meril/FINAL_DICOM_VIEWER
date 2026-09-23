/**
 * VTK.js & Cornerstone Compatibility Polyfills & Patches
 * 
 * Fixes:
 * 1. "TypeError: options.points.getNumberOfPoints is not a function" in VTK.js
 *    CellArrayBufferObject (cabo.createVBO / buildIndexArray) when points is a
 *    vtkDataArray rather than vtkPoints.
 * 2. "model._openGLRenderWindow.getWebgl2 is not a function" in Cornerstone3D
 *    vtkStreamingOpenGLVolumeMapper.
 * 3. Safe fallback for getRange / getData on points passed to WebGL mappers.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 0. FREEZE & EXTENSION IMMUNITY FOR VTK.JS OBJECTS
// Modern @kitware/vtk.js (v36+) calls Object.freeze(publicAPI) in macro.newInstance.
// This causes catastrophic failures in Cornerstone3D and VTK extensions that
// dynamically attach or update properties/methods on VTK objects at runtime:
// e.g. vtkStreamingOpenGLVolumeMapper does `cells.getNumberOfCells = () => 2;`
// When `cells` (a vtkDataArray) is frozen, strict mode throws:
// "TypeError: Cannot add property getNumberOfCells, object is not extensible".
// Intercepting Object.freeze/preventExtensions/seal ensures VTK objects remain
// extensible and writable, exactly as Cornerstone3D expects.
// ─────────────────────────────────────────────────────────────────────────────
function isVtkObject(obj: any): boolean {
  return Boolean(
    obj &&
    typeof obj === 'object' &&
    (typeof obj.isA === 'function' ||
      typeof obj.getClassName === 'function' ||
      typeof obj.getMTime === 'function' ||
      obj.isDeleted !== undefined ||
      obj.classHierarchy !== undefined)
  );
}

const origFreeze = Object.freeze;
Object.freeze = function <T>(obj: T): T {
  if (isVtkObject(obj)) {
    return obj;
  }
  return origFreeze(obj);
};

const origPreventExtensions = Object.preventExtensions;
Object.preventExtensions = function <T>(obj: T): T {
  if (isVtkObject(obj)) {
    return obj;
  }
  return origPreventExtensions(obj);
};

const origSeal = Object.seal;
Object.seal = function <T>(obj: T): T {
  if (isVtkObject(obj)) {
    return obj;
  }
  return origSeal(obj);
};

import macro from '@kitware/vtk.js/macros';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkCellArrayBufferObject from '@kitware/vtk.js/Rendering/OpenGL/CellArrayBufferObject';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPointSet from '@kitware/vtk.js/Common/DataModel/PointSet';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';

// Patch macro.newInstance to never freeze publicAPI
if (macro && typeof (macro as any).newInstance === 'function') {
  const origMacroNewInstance = (macro as any).newInstance;
  (macro as any).newInstance = function (extend: any, className: any) {
    const constructor = function (initialValues: any = {}) {
      const model: any = {};
      const publicAPI: any = {};
      extend(publicAPI, model, initialValues);
      return publicAPI; // Never Object.freeze
    };
    if (className && (macro as any).vtk?.register) {
      (macro as any).vtk.register(className, constructor);
    }
    return constructor;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE POLYFILLS:
// Guarantees that ANY object passed to VTK.js functions has getNumberOfPoints,
// getNumberOfCells, and getWebgl2 available up its prototype chain.
// ─────────────────────────────────────────────────────────────────────────────
if (!('getNumberOfPoints' in Object.prototype)) {
  Object.defineProperty(Object.prototype, 'getNumberOfPoints', {
    value: function () {
      const self = this as any;
      if (typeof self.getNumberOfTuples === 'function') return self.getNumberOfTuples();
      if (typeof self.getData === 'function') {
        const d = self.getData();
        return d ? Math.floor(d.length / 3) : 0;
      }
      if (self.values && self.values.length) return Math.floor(self.values.length / 3);
      if (Array.isArray(self) || ArrayBuffer.isView(self)) return Math.floor(self.length / 3);
      return 0;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!('getNumberOfCells' in Object.prototype)) {
  Object.defineProperty(Object.prototype, 'getNumberOfCells', {
    value: function () {
      const self = this as any;
      if (typeof self.getNumberOfTuples === 'function') return self.getNumberOfTuples();
      const d = typeof self.getData === 'function' ? self.getData() : self.values;
      return d ? d.length : 0;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!('getWebgl2' in Object.prototype)) {
  Object.defineProperty(Object.prototype, 'getWebgl2', {
    value: function () {
      const self = this as any;
      try {
        const gl = self.context || (typeof self.get3DContext === 'function' ? self.get3DContext() : null);
        return Boolean(gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
      } catch {
        return false;
      }
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Wrap a points object in safe helper methods if it lacks getNumberOfPoints, getData, or getRange.
 */
export function ensurePointsHasGetNumberOfPoints<T>(points: T): T {
  if (!points || (typeof points !== 'object' && typeof points !== 'function')) {
    return points;
  }

  const p = points as any;
  if (typeof p.getNumberOfPoints === 'function') {
    return points;
  }

  try {
    if (typeof p.getNumberOfPoints !== 'function') {
      Object.defineProperty(p, 'getNumberOfPoints', {
        value: function () {
          if (typeof p.getNumberOfTuples === 'function') return p.getNumberOfTuples();
          if (typeof p.getData === 'function') {
            const d = p.getData();
            return d ? Math.floor(d.length / 3) : 0;
          }
          if (p.values && p.values.length) return Math.floor(p.values.length / 3);
          if (Array.isArray(p) || ArrayBuffer.isView(p)) return Math.floor(p.length / 3);
          return 0;
        },
        writable: true,
        configurable: true,
      });
    }
    if (typeof p.getData !== 'function') {
      Object.defineProperty(p, 'getData', {
        value: function () {
          if (p.values) return p.values;
          if (Array.isArray(p) || ArrayBuffer.isView(p)) return p;
          return new Float32Array(0);
        },
        writable: true,
        configurable: true,
      });
    }
    if (typeof p.getRange !== 'function') {
      Object.defineProperty(p, 'getRange', {
        value: function (comp: number = 0) {
          const d = typeof p.getData === 'function' ? p.getData() : (p.values || p);
          if (!d || !d.length) return [0, 0];
          let min = Infinity;
          let max = -Infinity;
          for (let i = comp; i < d.length; i += 3) {
            const v = d[i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          return min === Infinity ? [0, 0] : [min, max];
        },
        writable: true,
        configurable: true,
      });
    }
    return points;
  } catch {
    try {
      const clone = Object.create(p);
      clone.getNumberOfPoints = function () {
        if (typeof p.getNumberOfTuples === 'function') return p.getNumberOfTuples();
        if (typeof p.getData === 'function') {
          const d = p.getData();
          return d ? Math.floor(d.length / 3) : 0;
        }
        if (p.values && p.values.length) return Math.floor(p.values.length / 3);
        if (Array.isArray(p) || ArrayBuffer.isView(p)) return Math.floor(p.length / 3);
        return 0;
      };
      clone.getData = function () {
        if (p.values) return p.values;
        if (Array.isArray(p) || ArrayBuffer.isView(p)) return p;
        return new Float32Array(0);
      };
      clone.getRange = function (comp: number = 0) {
        const d = typeof p.getData === 'function' ? p.getData() : (p.values || p);
        if (!d || !d.length) return [0, 0];
        let min = Infinity;
        let max = -Infinity;
        for (let i = comp; i < d.length; i += 3) {
          const v = d[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        return min === Infinity ? [0, 0] : [min, max];
      };
      return clone;
    } catch {
      return points;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1: vtkDataArray
// Ensure every vtkDataArray instance has getNumberOfPoints = getNumberOfTuples
// ─────────────────────────────────────────────────────────────────────────────
if (vtkDataArray && (vtkDataArray as any).extend) {
  // Override vtkDataArray.newInstance to directly return an unfrozen, extensible object
  (vtkDataArray as any).newInstance = function (initialValues: any = {}) {
    const model: any = {};
    const publicAPI: any = {};
    (vtkDataArray as any).extend(publicAPI, model, initialValues);
    return publicAPI; // Never Object.freeze
  };

  const origDataArrayExtend = (vtkDataArray as any).extend;
  const patchedDataArrayExtend = function (publicAPI: any, model: any, initialValues: any = {}) {
    origDataArrayExtend(publicAPI, model, initialValues);
    try {
      if (publicAPI) {
        if (!Object.prototype.hasOwnProperty.call(publicAPI, 'getNumberOfPoints')) {
          publicAPI.getNumberOfPoints = function () {
            if (typeof publicAPI.getNumberOfTuples === 'function') {
              return publicAPI.getNumberOfTuples();
            }
            const d = publicAPI.getData ? publicAPI.getData() : model?.values;
            const c = publicAPI.getNumberOfComponents ? publicAPI.getNumberOfComponents() : (model?.numberOfComponents || 3);
            return d ? Math.floor(d.length / c) : 0;
          };
        }
        if (!Object.prototype.hasOwnProperty.call(publicAPI, 'getNumberOfCells')) {
          publicAPI.getNumberOfCells = function () {
            if (typeof publicAPI.getNumberOfTuples === 'function') {
              return publicAPI.getNumberOfTuples();
            }
            const d = publicAPI.getData ? publicAPI.getData() : model?.values;
            return d ? d.length : 0;
          };
        }
      }
    } catch {}
  };
  (vtkDataArray as any).extend = patchedDataArrayExtend;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 2: vtkCellArrayBufferObject (CABO)
// Intercept createVBO to ensure options.points always provides getNumberOfPoints
// and cellArray provides getNumberOfCells
// ─────────────────────────────────────────────────────────────────────────────
if (vtkCellArrayBufferObject && (vtkCellArrayBufferObject as any).extend) {
  const origCABOExtend = (vtkCellArrayBufferObject as any).extend;
  const patchedCABOExtend = function (publicAPI: any, model: any, initialValues: any = {}) {
    origCABOExtend(publicAPI, model, initialValues);
    const origCreateVBO = publicAPI.createVBO;
    publicAPI.createVBO = function (
      cellArray: any,
      inRep: any,
      outRep: any,
      options: any,
      selectionMaps: any = null
    ) {
      if (cellArray && typeof cellArray.getNumberOfCells !== 'function') {
        try {
          cellArray.getNumberOfCells = function () {
            if (typeof cellArray.getNumberOfTuples === 'function') {
              return cellArray.getNumberOfTuples();
            }
            const d = typeof cellArray.getData === 'function' ? cellArray.getData() : cellArray.values;
            return d ? d.length : 0;
          };
        } catch {
          // ignore if frozen
        }
      }
      if (options) {
        options = {
          ...options,
          // CRITICAL: VolumeMapper.renderPieceDraw calls gl.drawArrays(gl.TRIANGLES, 0, cabo.getElementCount())
          // directly without binding the index buffer. If canUseIndexedVBO returns true, CABO only uploads
          // 4 vertices into the VBO instead of 6 flattened vertices, causing gl.drawArrays to only draw the
          // first triangle (half the screen quad, cut diagonally). Forcing forceFlatten: true ensures all 6
          // vertices are unpacked and both triangles render.
          forceFlatten: true,
        };
        if (options.points && typeof options.points.getNumberOfPoints !== 'function') {
          options.points = ensurePointsHasGetNumberOfPoints(options.points);
        }
      }
      return origCreateVBO.call(this, cellArray, inRep, outRep, options, selectionMaps);
    };
  };
  (vtkCellArrayBufferObject as any).extend = patchedCABOExtend;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 3: vtkPointSet & vtkPolyData
// Ensure getPoints() always returns a points object with getNumberOfPoints
// ─────────────────────────────────────────────────────────────────────────────
if (vtkPointSet && (vtkPointSet as any).extend) {
  const origPointSetExtend = (vtkPointSet as any).extend;
  const patchedPointSetExtend = function (publicAPI: any, model: any, initialValues: any = {}) {
    origPointSetExtend(publicAPI, model, initialValues);
    const origGetPoints = publicAPI.getPoints;
    publicAPI.getPoints = function () {
      const pts = origGetPoints ? origGetPoints.call(this) : model.points;
      return pts ? ensurePointsHasGetNumberOfPoints(pts) : pts;
    };
  };
  (vtkPointSet as any).extend = patchedPointSetExtend;
}

if (vtkPolyData && (vtkPolyData as any).extend) {
  const origPolyDataExtend = (vtkPolyData as any).extend;
  const patchedPolyDataExtend = function (publicAPI: any, model: any, initialValues: any = {}) {
    origPolyDataExtend(publicAPI, model, initialValues);
    const origGetPoints = publicAPI.getPoints;
    publicAPI.getPoints = function () {
      const pts = origGetPoints ? origGetPoints.call(this) : model.points;
      return pts ? ensurePointsHasGetNumberOfPoints(pts) : pts;
    };
    const origSetPoints = publicAPI.setPoints;
    publicAPI.setPoints = function (pts: any) {
      const safePts = pts ? ensurePointsHasGetNumberOfPoints(pts) : pts;
      return origSetPoints.call(this, safePts);
    };
  };
  (vtkPolyData as any).extend = patchedPolyDataExtend;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 4: vtkOpenGLRenderWindow safe get3DContext() and getWebgl2()
// Prevents VTK.js from calling new Proxy(null, handler) which throws
// "TypeError: Cannot create proxy with a non-object as target or handler"
// when WebGL2 context creation returns null.
// ─────────────────────────────────────────────────────────────────────────────
if (vtkOpenGLRenderWindow && (vtkOpenGLRenderWindow as any).extend) {
  const origExtend = (vtkOpenGLRenderWindow as any).extend;
  const patchedExtend = function (publicAPI: any, model: any, initialValues: any = {}) {
    origExtend(publicAPI, model, initialValues);
    
    const origGet3DContext = publicAPI.get3DContext;
    publicAPI.get3DContext = function (options: any) {
      if (model.context) {
        return model.context;
      }
      if (!model.canvas || typeof WebGL2RenderingContext === 'undefined') {
        return null;
      }
      const opts = options || {
        preserveDrawingBuffer: false,
        depth: true,
        alpha: true,
        powerPreference: 'high-performance',
      };
      let gl: any = null;
      try {
        gl = model.canvas.getContext('webgl2', opts) || model.canvas.getContext('experimental-webgl2', opts);
      } catch {
        gl = null;
      }
      if (!gl) {
        return null;
      }
      try {
        const proxied = origGet3DContext ? origGet3DContext.call(this, options) : gl;
        return proxied || gl;
      } catch {
        return gl;
      }
    };

    publicAPI.getWebgl2 = () => {
      try {
        const gl = model.context || (publicAPI.get3DContext ? publicAPI.get3DContext() : null);
        return Boolean(gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
      } catch {
        return false;
      }
    };
  };
  (vtkOpenGLRenderWindow as any).extend = patchedExtend;
}

console.info('[VTK Polyfill] Patches for CellArrayBufferObject, DataArray, PolyData, and RenderWindow initialized.');
