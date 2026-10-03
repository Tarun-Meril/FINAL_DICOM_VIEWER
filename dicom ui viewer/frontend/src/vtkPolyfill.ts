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
// SAFE DOM REMOVE CHILD
// Prevents "NotFoundError: Failed to execute 'removeChild' on 'Node': The node
// to be removed is not a child of this node." when VTK.js or viewports unmount
// and attempt to remove a canvas or child element that was already detached.
// ─────────────────────────────────────────────────────────────────────────────
if (typeof Node !== 'undefined' && Node.prototype && Node.prototype.removeChild) {
  const origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child && child.parentNode !== this) {
      if (child.parentNode) {
        try {
          return origRemoveChild.call(child.parentNode, child) as T;
        } catch {}
      }
      return child;
    }
    try {
      return origRemoveChild.call(this, child);
    } catch {
      return child;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE PROXY WRAPPER
// Prevents "TypeError: Cannot create proxy with a non object as target or handler"
// when VTK.js or other WebGL libraries attempt to proxy a null/lost context.
// ─────────────────────────────────────────────────────────────────────────────

function createSafeDummyWebGLContext(): any {
  const dummy: any = {
    MAX_TEXTURE_IMAGE_UNITS: 0x8872,
    MAX_3D_TEXTURE_SIZE: 0x8073,
    MAX_TEXTURE_SIZE: 0x0D33,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE0: 0x84C0,
    TEXTURE_2D: 0x0DE1,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    FRAMEBUFFER_COMPLETE: 0x8CD5,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE: 1,
    LEQUAL: 0x0203,
    BLEND: 0x0BE2,
    DEPTH_TEST: 0x0B71,
    SCISSOR_TEST: 0x0C11,
    CULL_FACE: 0x0B44,
    DEPTH_WRITEMASK: 0x0982,
    UNMASKED_RENDERER_WEBGL: 0x9246,
    RENDERER: 0x1F01,

    getParameter: (param: number) => {
      if (param === 0x8872) return 16;
      if (param === 0x8073) return 2048;
      if (param === 0x0D33) return 4096;
      if (param === 0x9246 || param === 0x1F01) return 'WebGL2 Standard Fallback';
      return 0;
    },
    getExtension: () => null,
    getSupportedExtensions: () => [],
    isEnabled: () => false,
    enable: () => {},
    disable: () => {},
    depthFunc: () => {},
    depthMask: () => {},
    blendFuncSeparate: () => {},
    viewport: () => {},
    scissor: () => {},
    clear: () => {},
    clearColor: () => {},
    bindTexture: () => {},
    activeTexture: () => {},
    createTexture: () => ({}),
    deleteTexture: () => {},
    createFramebuffer: () => ({}),
    deleteFramebuffer: () => {},
    bindFramebuffer: () => {},
    framebufferTexture2D: () => {},
    checkFramebufferStatus: () => 0x8CD5,
    texImage2D: () => {},
    readPixels: () => {},
    makeCurrent: () => {},
  };
  return dummy;
}

if (typeof window !== 'undefined' && typeof window.Proxy !== 'undefined') {
  const OrigProxy = window.Proxy;
  const SafeProxy = function (target: any, handler: any) {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
      // In JavaScript `new Constructor()` ignores returning primitives/null and returns `this`.
      // Returning a Proxy wrapping a safe dummy context guarantees constructor callers receive
      // a valid proxy with getParameter() and other standard WebGL methods instead of an empty {}.
      return new OrigProxy(createSafeDummyWebGLContext(), handler || {});
    }
    return new OrigProxy(target, handler);
  } as any;
  SafeProxy.revocable = OrigProxy.revocable;
  Object.setPrototypeOf(SafeProxy, OrigProxy);
  (window as any).Proxy = SafeProxy;
}

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
import { registerViewConstructor } from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkOpenGLTextureUnitManager from '@kitware/vtk.js/Rendering/OpenGL/TextureUnitManager';
import vtkCellArrayBufferObject from '@kitware/vtk.js/Rendering/OpenGL/CellArrayBufferObject';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPointSet from '@kitware/vtk.js/Common/DataModel/PointSet';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';

function patchOpenGLRenderWindowInstance(publicAPI: any, model: any) {
  if (!publicAPI || (publicAPI as any).__patchedOpenGLRenderWindow) return;
  (publicAPI as any).__patchedOpenGLRenderWindow = true;

  publicAPI.get3DContext = function (options: any) {
    if (model.context && typeof model.context.getParameter === 'function') {
      return model.context;
    }
    if (!model.canvas || typeof WebGL2RenderingContext === 'undefined') {
      const dummy = createSafeDummyWebGLContext();
      model.context = dummy;
      return dummy;
    }

    const preferred = options || {
      preserveDrawingBuffer: false,
      depth: true,
      alpha: true,
      powerPreference: 'high-performance',
    };

    let gl: any = null;
    try {
      gl = model.canvas.getContext('webgl2', preferred);
    } catch {}

    if (!gl) {
      try {
        gl = model.canvas.getContext('webgl2', {
          preserveDrawingBuffer: false,
          depth: true,
          alpha: true,
          antialias: false,
        });
      } catch {}
    }

    if (!gl) {
      try {
        gl = model.canvas.getContext('webgl2', { depth: true, alpha: true }) || model.canvas.getContext('webgl2');
      } catch {}
    }

    if (!gl) {
      try {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        for (const c of canvases) {
          if (c === model.canvas) continue;
          if (!document.body.contains(c) || c.style.display === 'none' || c.offsetParent === null) {
            try {
              const dummyCtx = c.getContext('webgl2') || c.getContext('webgl');
              dummyCtx?.getExtension('WEBGL_lose_context')?.loseContext();
              c.width = 1;
              c.height = 1;
            } catch {}
          }
        }
      } catch {}

      try {
        gl = model.canvas.getContext('webgl2', { depth: true, alpha: true }) ||
             model.canvas.getContext('webgl2') ||
             model.canvas.getContext('experimental-webgl2');
      } catch {}
    }

    if (!gl) {
      console.warn('[VTK Polyfill] All WebGL2 context acquisition attempts returned null. Using safe dummy WebGL context fallback.');
      const fallback = createSafeDummyWebGLContext();
      model.context = fallback;
      return fallback;
    }

    model.context = gl;
    return gl;
  };

  publicAPI.getWebgl2 = () => {
    try {
      const gl = model.context || (publicAPI.get3DContext ? publicAPI.get3DContext() : null);
      return Boolean(gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
    } catch {
      return false;
    }
  };

  const origSetContainer = publicAPI.setContainer;
  publicAPI.setContainer = function (el: any) {
    if (model.el && model.el !== el) {
      if (model.canvas && model.canvas.parentNode === model.el) {
        try {
          model.el.removeChild(model.canvas);
        } catch {}
      }
      if (model.bgImage && model.el.contains && model.el.contains(model.bgImage)) {
        try {
          model.el.removeChild(model.bgImage);
        } catch {}
      }
      model.el = el;
      if (model.el && model.canvas) {
        model.el.appendChild(model.canvas);
        if (model.useBackgroundImage && model.bgImage) {
          model.el.appendChild(model.bgImage);
        }
      }
      publicAPI.modified();
      return;
    }
    if (origSetContainer) {
      try {
        origSetContainer.call(this, el);
      } catch {}
    }
  };
}

// Patch macro.newInstance to never freeze publicAPI and hook instances
if (macro && typeof (macro as any).newInstance === 'function') {
  const origMacroNewInstance = (macro as any).newInstance;
  (macro as any).newInstance = function (extend: any, className: any) {
    const constructor = function (initialValues: any = {}) {
      const model: any = {};
      const publicAPI: any = {};
      extend(publicAPI, model, initialValues);
      if (className === 'vtkOpenGLRenderWindow' || publicAPI.isA?.('vtkOpenGLRenderWindow')) {
        patchOpenGLRenderWindowInstance(publicAPI, model);
      }
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
// or causing ctx.getParameter is not a function when WebGL2 context creation returns null.
// ─────────────────────────────────────────────────────────────────────────────
if (vtkOpenGLRenderWindow && (vtkOpenGLRenderWindow as any).extend) {
  const origExtend = (vtkOpenGLRenderWindow as any).extend;
  const patchedExtend = function (publicAPI: any, model: any, initialValues: any = {}) {
    origExtend(publicAPI, model, initialValues);
    patchOpenGLRenderWindowInstance(publicAPI, model);
  };
  (vtkOpenGLRenderWindow as any).extend = patchedExtend;
}

if (typeof registerViewConstructor === 'function') {
  registerViewConstructor('WebGL', (initialValues: any = {}) => {
    return (vtkOpenGLRenderWindow as any).newInstance(initialValues);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 5: vtkOpenGLTextureUnitManager safe getParameter & allocation
// Guarantees that ctx.getParameter(MAX_TEXTURE_IMAGE_UNITS) never throws
// "TypeError: ctx.getParameter is not a function" even if a mock or non-standard
// context is attached.
// ─────────────────────────────────────────────────────────────────────────────
if (vtkOpenGLTextureUnitManager && (vtkOpenGLTextureUnitManager as any).extend) {
  const origTextureUnitExtend = (vtkOpenGLTextureUnitManager as any).extend;
  const patchedTextureUnitExtend = function (publicAPI: any, model: any, initialValues: any = {}) {
    origTextureUnitExtend(publicAPI, model, initialValues);
    publicAPI.setContext = function (ctx: any) {
      if (model.context !== ctx) {
        if (model.context !== 0 && typeof publicAPI.deleteTable === 'function') {
          publicAPI.deleteTable();
        }
        model.context = ctx;
        if (model.context) {
          if (typeof ctx?.getParameter === 'function') {
            try {
              model.numberOfTextureUnits = ctx.getParameter(ctx.MAX_TEXTURE_IMAGE_UNITS || 0x8872) || 16;
            } catch {
              model.numberOfTextureUnits = 16;
            }
          } else {
            model.numberOfTextureUnits = 16;
          }
          if (!Array.isArray(model.textureUnits)) model.textureUnits = [];
          for (let i = 0; i < model.numberOfTextureUnits; ++i) {
            model.textureUnits[i] = false;
          }
        }
        if (typeof publicAPI.modified === 'function') {
          publicAPI.modified();
        }
      }
    };
  };
  (vtkOpenGLTextureUnitManager as any).extend = patchedTextureUnitExtend;
}

console.info('[VTK Polyfill] Patches for CellArrayBufferObject, DataArray, PolyData, and RenderWindow initialized.');
