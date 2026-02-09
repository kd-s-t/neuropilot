declare module "three/examples/jsm/loaders/GLTFLoader.js" {
  export class GLTFLoader {
    constructor();
    load(
      url: string,
      onLoad?: (gltf: unknown) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (error: unknown) => void
    ): void;
    parse(
      data: ArrayBuffer,
      path: string,
      onLoad: (gltf: unknown) => void,
      onError?: (error: unknown) => void
    ): void;
  }
}
