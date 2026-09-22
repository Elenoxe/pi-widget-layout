# pi-widget-layout

Deterministic layout control for Pi extension widgets.

Pi does not provide a way to configure widget order. Widget positions depend on when extensions create or update them, so the visible order may change during a session. `pi-widget-layout` lets you customize and fix widget positions so the layout stays stable.

## Installation

```bash
pi install npm:@eleno/pi-widget-layout
```

Alternatively, install from GitHub:

```bash
pi install git:github.com/Elenoxe/pi-widget-layout
```

## How it works

Pi's interactive TUI is roughly composed of:

```text
header / conversation
pending messages
working indicator
aboveEditor widgets
editor
belowEditor widgets
footer
```

Extension widgets live in the `aboveEditor` and `belowEditor` areas. Pi normally keeps them in insertion order, so their relative positions can change as extensions create, update, clear, or re-add widgets.

`pi-widget-layout` intercepts widget registrations for both `aboveEditor` and `belowEditor`. Each area has its own configuration and a managed host widget. Selected widgets are rendered inside that host in a fixed order. Their position is determined by the configured selectors instead of extension update timing.

## Commands

| Command                 | Description                    |
| ----------------------- | ------------------------------ |
| `/widget-layout`        | Show the current widget layout |
| `/widget-layout status` | Same as `/widget-layout`       |

## Configuration

### Scope

Configuration can be defined at both user and project scope:

| Scope   | Path                             |
| ------- | -------------------------------- |
| User    | `~/.pi/agent/widget-layout.json` |
| Project | `.pi/widget-layout.json`         |

Example:

```json
{
  "status": {
    "keyColumnMaxWidth": 24,
    "maxCollapsedLines": 12
  },
  "aboveEditor": {
    "unlisted": "native",
    "order": ["alpha", "*", "item-*"]
  },
  "belowEditor": {
    "unlisted": "native",
    "order": ["beta-*", "some-*-widget", "*"]
  }
}
```

### `status`

Controls the display of `/widget-layout`.

| Option              | Default | Description                                  |
| ------------------- | ------: | -------------------------------------------- |
| `keyColumnMaxWidth` |    `24` | Maximum alignment width for widget keys      |
| `maxCollapsedLines` |    `12` | Line limit before status output is collapsed |

### `aboveEditor` and `belowEditor`

Each area's `order` defines the fixed widget order using exact keys and simple `*` wildcards.

Matching priority:

```text
exact > wildcard > *
```

Exact selectors take priority over wildcard selectors. If multiple wildcard selectors match, the earlier selector in `order` wins. Widgets matched by the same selector keep the order in which they first appeared.

Each area's `unlisted` controls widgets in that area that do not match any selector:

| Value    | Behavior                                                          |
| -------- | ----------------------------------------------------------------- |
| `native` | Keep Pi's native ordering                                         |
| `above`  | Place them at the top of the managed host, in first-seen order    |
| `below`  | Place them at the bottom of the managed host, in first-seen order |

`unlisted` does not take effect if `order` contains `*`.
