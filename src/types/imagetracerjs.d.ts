declare module 'imagetracerjs' {
  interface TracerOptions {
    numberofcolors?: number;
    pathomit?: number;
    ltres?: number;
    qtres?: number;
    blurradius?: number;
    blurdelta?: number;
    strokewidth?: number;
    scale?: number;
    colorquantcycles?: number;
    mincolorratio?: number;
    colorsampling?: number;
    roundcoords?: number;
    [key: string]: number | string | undefined;
  }

  const ImageTracer: {
    imagedataToSVG: (imageData: ImageData, options?: TracerOptions) => string;
  };

  export default ImageTracer;
}
