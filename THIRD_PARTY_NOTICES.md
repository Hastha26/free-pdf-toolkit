# Third-party software

| Runtime package   | License | Source                                 |
| ----------------- | ------- | -------------------------------------- |
| Next.js           | MIT     | https://github.com/vercel/next.js      |
| React / React DOM | MIT     | https://github.com/facebook/react      |
| pdf-lib           | MIT     | https://github.com/Hopding/pdf-lib     |
| fflate            | MIT     | https://github.com/101arrowz/fflate    |
| lucide-react      | ISC     | https://github.com/lucide-icons/lucide |

Applicable copyright and license notices are included in each dependency's distributed package. Retain them when redistributing dependencies. The lockfile identifies exact versions, including transitive packages with their own notices.

## Additional runtime components

- Mozilla PDF.js / pdfjs-dist: Apache-2.0; its license is copied with the locally served worker assets.
- FastAPI, python-docx, python-pptx, openpyxl, pdfplumber, pdfminer.six: MIT.
- pypdf: BSD-3-Clause.
- pypdfium2: Apache-2.0 / BSD-3-Clause; bundled PDFium and its dependencies retain their notices.
- Pillow: HPND; uvicorn: BSD-3-Clause; defusedxml: PSF-2.0.
- LibreOffice: MPL-2.0 (and applicable bundled component licenses); nginx: BSD-2-Clause.

The frontend code does not incorporate LibreOffice; it communicates with the separately packaged self-hosted service. Container packages include their upstream license notices. Do not remove notices when redistributing images or dependencies. No AGPL/commercial-only conversion engine is required by this implementation.
