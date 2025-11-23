# Portfolio Generator

A self-hosted portfolio site generator that builds pages from your folder structure.

## Structure

```
projects/
├── sculpture/
├── print/
├── digital/
└── photo-video/
    └── your-project-name/
        ├── info.md
        └── images/
            ├── 01.jpg
            ├── 02.jpg
            └── ...
```

## Creating a Project

1. Choose a type folder: `sculpture`, `print`, `digital`, or `photo-video`
2. Create a project folder with a descriptive name (becomes the URL slug)
3. Create `info.md` with your metadata:

```markdown
---
title: Your Project Title
date: 2024-11
materials: After Effects, Illustrator, etc.
vimeo: https://vimeo.com/123456789
youtube: https://www.youtube.com/watch?v=VIDEO_ID
---

Your project statement goes here. You can use **markdown formatting**.

Multiple paragraphs work too.
```

**Note:** For videos, add a `vimeo` or `youtube` field in the frontmatter:
- **Vimeo**: `vimeo: https://vimeo.com/123456789` (or array for multiple)
- **YouTube**: `youtube: https://www.youtube.com/watch?v=VIDEO_ID` (or array for multiple)
- YouTube is **free and unlimited** - perfect if you're hitting Vimeo storage limits!

4. Add images to the `images/` subfolder (or PDFs, or video links in frontmatter)
5. Run `npm run build`

## Building

```bash
npm run build
```

This generates your site in the `output/` folder.

## Viewing Locally

Open `output/index.html` in your browser, or use a local server:

```bash
cd output
python3 -m http.server 8000
# Visit http://localhost:8000
```

## Customizing

- Edit `build.js` to change HTML structure
- Edit the CSS generation in `build.js` (look for `generateCSS()`)
- Images are sorted alphabetically - name them `01.jpg`, `02.jpg`, etc. to control order

## Self-Hosting

Upload everything in the `output/` folder to your web server. That's it!
