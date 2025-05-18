// TODO need to implement this webglstub to test webgl environment of cesium?

import { defaultValue } from "@cesium/engine";
import { Viewer } from "../index.js";

function createViewer(container, options) {
  options = defaultValue(options, {});
  options.contextOptions = defaultValue(options.contextOptions, {});
  options.contextOptions.webgl = defaultValue(options.contextOptions.webgl, {});
  if (window.webglStub) {
    options.contextOptions.getWebGLStub = getWebGLStub;
  }

  return new Viewer(container, options);
}
export default createViewer;
