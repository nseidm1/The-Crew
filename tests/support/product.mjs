// product.mjs - what each version of the app shows is one file, src/js/product.js, and whoever publishes it may have a part switched
// off there (Remote, today). A check of that part runs the app with a copy that has it on, so the check does not depend on the
// publisher's own setting and never changes it. The server reads the copy when FO_PRODUCT_FILE names it.
import fs from 'node:fs';
import path from 'node:path';
import { SRC, WORK } from './paths.mjs';

fs.mkdirSync(WORK, { recursive: true });
export const PRODUCT_REMOTE_ON = path.join(WORK, 'product-remote-on.js');
fs.writeFileSync(
  PRODUCT_REMOTE_ON,
  fs.readFileSync(path.join(SRC, 'js', 'product.js'), 'utf8').replace(/remote:\s*false/, 'remote: true'),
);
