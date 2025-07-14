# DeletePocIcons

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Nx workspace project focused on icon tokenization and transformation using Style Dictionary v5. The main purpose is to convert SVG icons into multiple output formats (JavaScript modules, PNG files, icon fonts, and web components).

## Architecture

- **Monorepo Structure**: Uses Nx workspace with packages in `packages/` directory
- **Icon Processing Pipeline**: Built around Style Dictionary v5 with custom transforms, formats, and actions
- **Multi-format Output**: Generates SVG JavaScript modules, PNG rasters, icon fonts, and web components from source SVG files

### Key Components

- `packages/icon-tokens/`: Main icon processing package containing:
  - `assets/`: Source SVG files (e.g., humberger.svg, ice-cream.svg)
  - `tokens/icons.json`: Token definitions mapping icon names to SVG files
  - `config.js`: Style Dictionary configuration with custom transforms and build pipeline
  - `dist/`: Generated output directory (SVG, PNG, fonts, web components)

## Common Commands

### Building Icons
```bash
# Build all icon formats
cd packages/icon-tokens && npm run build

# Build specific formats
cd packages/icon-tokens && npm run build:svg     # SVG JavaScript modules only
cd packages/icon-tokens && npm run build:png     # PNG files only  
cd packages/icon-tokens && npm run build:font    # Icon font files only
cd packages/icon-tokens && npm run build:webcomponent # Web components only
```

### Nx Commands
```bash
# Run tasks for specific projects
npx nx build <project-name>
npx nx typecheck <project-name>

# Sync TypeScript project references
npx nx sync

# Visualize project graph
npx nx graph

# Release management
npx nx release --dry-run
```

## Icon Workflow

1. **Add New Icons**: Place SVG files in `packages/icon-tokens/assets/`
2. **Register Icons**: Add entries to `packages/icon-tokens/tokens/icons.json` with type "asset"
3. **Build**: Run `npm run build` in the icon-tokens package to generate all formats
4. **Output**: Generated files appear in `packages/icon-tokens/dist/` with subdirectories for each format

## Development Notes

- SVG files must be placed in `packages/icon-tokens/assets/` directory
- Icon token definitions use type "asset" in the JSON configuration
- The build process uses Style Dictionary v5 with extensive custom transforms for SVG processing, PNG generation via Sharp, and font generation via webfont library
- Generated web components use shadow DOM and support size/color attributes
- Font generation creates WOFF2, WOFF, and TTF formats with corresponding CSS classes

## Output Structure
```
packages/icon-tokens/dist/
├── svg/
│   ├── icons.js         # JavaScript module with all icons
│   └── *.svg           # Individual SVG files
├── png/
│   └── *-{size}.png    # PNG files in multiple sizes (16, 24, 32, 48, 64)
├── fonts/
│   ├── MyIconFont.woff2
│   ├── MyIconFont.woff
│   ├── MyIconFont.ttf
│   └── MyIconFont.css   # CSS with icon classes
└── webcomponents/
    └── icons.js         # Web component implementation
```