import { constants } from 'fs';
import { access } from 'fs/promises';
import { join } from 'path';

export async function checkFileIsExists(
  directory: string,
  fileName: string,
): Promise<boolean> {
  const filePath = join(directory, fileName);
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
