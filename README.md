# WikiBoard  
**An infinite-canvas research tool – pure HTML5, CSS & vanilla JavaScript.**  
Search Wikipedia, open articles as draggable nodes, connect ideas with visual links, add sticky notes and images — all on an endless, zoomable board.

---

## 🎯 Overview

|                      |                                                              |
|----------------------|--------------------------------------------------------------|
| **Type**             | Visual knowledge mapping / research canvas                   |
| **Platform**         | Web browser (Chrome, Firefox, Edge, Safari)                  |
| **Technology**       | HTML5, CSS3, SVG, vanilla JavaScript – zero frameworks, zero dependencies |
| **Data Source**      | Wikipedia API (opensearch, extracts, page images, links)     |
| **Controls**         | Mouse + keyboard shortcuts                                   |
| **License**          | Educational & personal use                                   |

---

## ✨ Features

- **Wikipedia integration** – search articles, view summaries, load images, and explore related topics without leaving the board
- **Infinite canvas** – pan, zoom, fit-to-screen; dot‑grid background with minimap navigation
- **Draggable, resizable article nodes** – each node shows the article extract, thumbnail, and category tags
- **Visual connections** – curved, straight, or stepped lines with arrowheads; dashed style, labels, and reversible directions
- **Connection ports** – drag from any node side to another to link ideas
- **Collapsible nodes** – minimise articles to just a title bar to save space
- **Color themes** – cycle through six accent colors for nodes; full dark/light mode toggle
- **Sticky notes** – 5 pastel colors, free‑form text areas placed anywhere on the canvas
- **Editable text labels** – place italic annotations directly on the board
- **Image nodes** – pop out article images as separate, movable picture cards
- **Group boxes** – draw dashed rectangles to visually cluster related content
- **Right‑click context menus** – on nodes (open Wikipedia, duplicate, change color, collapse, delete) and on connections (style, label, reverse, delete)
- **Search autocomplete** – topbar search with keyboard shortcut; arrow‑key navigation through suggestions
- **Mini‑map** – live overview of the whole board with viewport indicator
- **Export** – save the board structure as a JSON file (nodes + connections) for backup or sharing
- **Keyboard‑driven** – almost every action has a shortcut; see the built‑in help panel
- **Self‑contained** – a single HTML file, no build step or server required

---

## 🚀 How to Run

1. **Download or clone** the repository.
2. Open `wikiboard.html` (or whatever you name it) in any modern browser.
3. Start typing a Wikipedia article name in the top search bar, select a suggestion, and the article opens as a node on the canvas.

> No build tools, npm, or server needed – runs directly from the file system.

---

## 🎮 Usage & Controls

### Core Workflow
1. **Search** – type in the top bar (or press `S`/`/`) and pick a Wikipedia article.
2. **Nodes** – articles appear as cards. Move them by dragging the top grip, resize from the bottom‑right corner.
3. **Connect** – hover over a node to reveal ports, drag from one port to another node’s port to create a link.
4. **Right‑click** – on a node for options (open Wikipedia, duplicate, change color, collapse, delete); on a connection to change style or add a label.

### Toolbar & Shortcuts

| Tool         | Shortcut | Description                                      |
|--------------|----------|--------------------------------------------------|
| Select       | `V`      | Click nodes/connections to select, drag nodes    |
| Pan          | `H`      | Drag canvas to move around (also middle‑mouse)   |
| Connect      | `C`      | Drag from port to port to draw connections       |
| Sticky note  | `N`      | Click canvas to place a note                     |
| Text label   | `T`      | Click canvas to add editable text                |
| Group box    | `G`      | Drag on canvas to draw a group rectangle         |
| Erase        | `E`      | Click nodes/stickies/text to delete              |
| Fit screen   | `F`      | Zoom to show all nodes                           |
| Zoom         | `+` / `−` | Zoom in/out (or scroll wheel)                    |
| Delete       | `Del`    | Delete selected node or connection               |
| Duplicate    | `Ctrl+D` | Duplicate selected node                          |
| Search       | `S` or `/` | Focus the search bar                             |
| Help         | `?`      | Toggle shortcut panel                            |
| Escape       | `Esc`    | Deselect all, close menus, cancel connect tool   |

### Canvas Navigation
- **Scroll wheel** – zoom in/out centred on cursor
- **Middle‑mouse drag** or **hold Alt + drag** – pan
- **Click on minimap** (bottom‑right) – jump to that area

---

## 🧠 Technical Insights

### Rendering & Layout
- The entire board is a single `div#world` with absolute positioning; pan/zoom applied via CSS `transform: translate(tx, ty) scale(s)`
- Connections are SVG `<path>` elements overlaid on the world; Bézier curves with dynamic control-point offsets
- Minimap drawn on a separate `<canvas>`, reflecting all nodes and links in miniature

### API Integration
- Uses Wikipedia’s public REST‑style endpoints (`action=opensearch`, `action=query` with `prop=extracts|pageimages|links|images`)
- Fetch is asynchronous; nodes display a loading spinner while content loads; failed requests handled gracefully

### State Management
- All objects stored in plain JavaScript objects keyed by unique IDs:
  - `G.nodes` – article cards (position, title, extracted HTML, color)
  - `G.conns` – links between nodes (style, arrow type, label)
  - `G.stickies`, `G.texts`, `G.images`, `G.groups` – additional canvas items
- No external state library – lightweight and debuggable

### Interaction Design
- Pointer events carefully delegated: grips, textareas, and buttons stop propagation to prevent unwanted drags
- Custom context menus and dropdown autocomplete built with vanilla DOM manipulation
- Smooth drag/resize handled via `mousemove`/`mouseup` listeners
- Connection creation: port hit‑testing with SVG paths for easier targeting

### Performance
- The SVG layer only contains visible paths; nodes use DOM recycling (no virtual list needed at this scale)
- Zoom/pan and resize events use `requestAnimationFrame` indirectly via CSS transitions and direct style updates
- Minimap redrawn on every meaningful change (cheap operation at 138×88 pixels)

---

## 📁 File Structure

- **`wikiboard.html`** – Complete application: HTML structure, CSS (embedded in `<style>`), and all JavaScript (embedded in `<script>`)
- **`README.md`** – Documentation

Everything in one file – maximum portability.

---

## 🎨 Customization

You can tweak WikiBoard by editing the embedded CSS or JavaScript constants:

- **Colors** – modify the `COLS` array (6 accent colors) or the sticky note palette `SCOLS`
- **Grid** – change `background-size` on `body::before` to adjust dot spacing
- **Default size / position** – adjust `W` (world size), initial `G.scale`, `G.tx`, `G.ty`
- **API behaviour** – change the number of links or images fetched in `wLinks` / `wImages`
- **UI strings** – alter tooltips, placeholder text, or menu labels

---

## 🔮 Future Ideas

- **Save board state to LocalStorage** (auto‑save) – currently only JSON export
- **Undo/Redo** – history stack for node/connection changes
- **Multi‑user collaboration** – WebRTC or CRDT (Yjs) for shared boards
- **Offline Wikipedia** – cache articles with Service Worker for offline use
- **Tagging & filtering** – assign custom tags to nodes and filter the board
- **Presentation mode** – full‑screen with step‑by‑step reveal of nodes/connections
- **Rich text editing** – bold, italic, lists inside sticky notes and node bodies
- **Image upload** – paste or drag‑drop images onto the canvas
- **Excalidraw‑style drawing** – freehand pen tool

---

## 👤 Author

**Rahul Raj Singh**  
- GitHub: [https://github.com/rahulrajsinghwork15072005-a11y](https://github.com/rahulrajsinghwork15072005-a11y)  
- LinkedIn: [https://www.linkedin.com/in/rahul-raj-singh-57442a3b3/](https://www.linkedin.com/in/rahul-raj-singh-57442a3b3/)  
- Email: rahulrajsingh.work.15072005@gmail.com

---

## 🧾 License

This project is provided for educational and entertainment purposes.  
Not affiliated with Wikipedia or the Wikimedia Foundation.  
Feel free to modify, adapt, and share. No warranty.

**Start connecting ideas – the board is infinite. 📌**
