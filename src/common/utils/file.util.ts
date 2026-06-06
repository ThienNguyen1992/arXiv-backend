import * as fs from 'fs/promises';
import * as path from 'path';

export async function verifyLocalJsonFile(filePath: string): Promise<{ isValid: boolean; message?: string }> {
  if (!filePath) {
    return { isValid: false, message: 'File path is required' };
  }

  // Verify file extension
  if (path.extname(filePath).toLowerCase() !== '.json') {
    return { isValid: false, message: 'File must be a JSON file (e.g., .json extension)' };
  }

  try {
    // Check if the file exists and is accessible
    const stat = await fs.stat(filePath);
    
    // Ensure it's a file and not a directory
    if (!stat.isFile()) {
      return { isValid: false, message: 'Path exists but is not a file' };
    }
    
    return { isValid: true };
  } catch (error) {
    return { isValid: false, message: 'File does not exist or cannot be accessed' };
  }
}
