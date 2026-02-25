# TemaDataPortal 3D Viewer

This repository contains the backend Node.js (`auth-server`) portal combined natively with the `cesium-discovery-app` React 3D Viewer. 

## Development Setup

The repository contains two components in a single folder structure:
1. `html/` and `auth-server/` - The vanilla HTML, CSS, and Express Node.js landing pages.
2. `react-viewer-app/` - The React Typescript source code for the 3D Viewer.

### Running the App
To run the main portal:
```bash
npm start
```
*Runs the TemaDataPortal on port 3000.*

To run the PostGIS Database API (For saving Measurements and Annotations):
```bash
cd react-viewer-app/server
npm start
```
*Runs the API server on port 3001.*

### Editing the React Viewer
If you make changes to the React source code located in `react-viewer-app/src`, you must build the code before it reflects on the portal. Rather than changing directories, you can run the unified build script from the project root:

```bash
npm run build-viewer
```
This script will automatically compile the React components and output the production-ready static assets directly into the `html/cesium-viewer` directory, overwriting the old viewer immediately.
