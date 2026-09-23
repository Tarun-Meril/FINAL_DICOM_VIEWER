import dicomParser from 'dicom-parser';
import { T } from '../dictionary';
import { MedViewError, ErrorCode } from '@3d/core/errors';
import { transferSyntax } from '../transferSyntax';
import type { DataSet } from '../parser';

/** Return the raw (still-encoded when encapsulated) bytes of one frame. */
export function extractFrameBytes(ds: DataSet, frameIndex: number): Uint8Array {
  const el = ds.elements[T.PixelData];
  if (!el) {
    throw new MedViewError({
      code: ErrorCode.PIXEL_DATA_MISSING,
      message: 'This image has no pixel data and cannot contribute to a volume.',
    });
  }
  const ts = transferSyntax(ds.string(T.TransferSyntaxUID) ?? '1.2.840.10008.1.2');
  if (ts.encapsulated) {
    try {
      if (el.basicOffsetTable?.length || el.fragments?.length) {
        return dicomParser.readEncapsulatedImageFrame(ds, el, frameIndex);
      }
      return dicomParser.readEncapsulatedPixelData(ds, el, frameIndex);
    } catch (e) {
      throw new MedViewError({
        code: ErrorCode.PIXEL_DATA_INVALID,
        message: 'The compressed pixel data of this image could not be read.',
        detail: e instanceof Error ? e.message : String(e),
        context: { frameIndex, transferSyntax: ts.uid },
      });
    }
  }
  // Native (uncompressed) pixel data: slice out the frame.
  const rows = ds.uint16(T.Rows) ?? 0;
  const cols = ds.uint16(T.Columns) ?? 0;
  const spp = ds.uint16(T.SamplesPerPixel) ?? 1;
  const bitsAllocated = ds.uint16(T.BitsAllocated) ?? 16;
  const frameBytes = Math.ceil((rows * cols * spp * bitsAllocated) / 8);
  const start = el.dataOffset + frameIndex * frameBytes;
  if (start + frameBytes > el.dataOffset + el.length) {
    throw new MedViewError({
      code: ErrorCode.PIXEL_DATA_INVALID,
      message: 'Pixel data is shorter than the declared image size; the file is truncated or corrupt.',
      detail: `need ${frameBytes} bytes at offset ${start}, element holds ${el.length}`,
    });
  }
  return new Uint8Array(ds.byteArray.buffer, ds.byteArray.byteOffset + start, frameBytes);
}
