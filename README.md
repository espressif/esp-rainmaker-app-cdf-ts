# ESP RainMaker TypeScript Base — CDF

`@espressif/rainmaker-base-cdf` is **CDF** for RainMaker apps. It provides one app-facing contract across adaptor implementations: unified entities, adaptor registration, event-driven operations, and MobX-backed stores coordinated by synchronizers.

---

## Table of Contents

- [Overview](#overview)
- [How CDF is structured](#how-cdf-is-structured)
- [Architecture at a glance](#architecture-at-a-glance)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core responsibilities](#core-responsibilities)
- [Resources](#resources)
- [License](#license)

---

## Overview

CDF lets apps integrate **multiple adaptors** through a **single, consistent model**:

- **Unified entities** (`ESPCDFNode`, `ESPCDFGroup`, `ESPCDFUser`, …) in [`src/entities`](src/entities) — the app contract; apps work with CDF types, not raw adaptor-specific types.
- **Adaptor registry** — register and switch implementations via [`src/registry.ts`](src/registry.ts) (`AdaptorRegistry`, capabilities, active adaptor).
- **Operation events** — entities emit typed results through [`src/utils/OperationEventEmitter.ts`](src/utils/OperationEventEmitter.ts); entities do not own long-lived store coupling.
- **Store synchronizers** — [`src/store/sync`](src/store/sync) applies **all** observable state updates and cross-store work after operations (user, group, node, scene, schedule, automation).
- **MobX reactivity** — stores expose observable entities (`userStore`, `groupStore`, `nodeStore`, `sceneStore`, `scheduleStore`, `automationStore`, `subscriptionStore`).
- **`_raw` and property-change sync** — adaptors keep the underlying source entity in sync with CDF property changes where needed.

Together, this yields **one API to learn**, **predictable state transitions**, and **type-safe** TypeScript across implementations.

---

## How CDF is structured

| Piece | Role |
| -------- | ---- |
| **Adaptors** | Implement `ESPSDKAdaptorCore` (and feature interfaces); transform source entities into CDF entities and supply `operations` delegates. |
| **CDF entities** | Thin wrappers: call `operations`, emit success/failure on `OperationEventEmitter`; **synchronizers** apply property updates via stores — entities do not self-mutate app-visible state in the unified pattern. |
| **Stores** | Hold observable maps/lists; expose `@action` update helpers for synchronizers; typically exclude `_raw` and `operations` from deep MobX tracking where appropriate. |
| **Synchronizers** | Subscribe to entity events, map operation payloads to store updates, coordinate multi-store effects, manage attach/detach lifecycle. |

---

## Architecture at a glance

Typical operation path through CDF:

1. App calls a method on a **CDF entity** (e.g. `group.getNodes()`, `automation.update(...)`).
2. Entity runs the **adaptor `operations`** (underlying implementation call).
3. Entity **emits** an operation event (success or failure).
4. The relevant **store synchronizer** handles the event and updates **stores** (`@action` / observable updates).
5. **MobX** propagates changes to the UI.

---

## Installation

### npm

```bash
npm install @espressif/rainmaker-base-cdf
```

### yarn

```bash
yarn add @espressif/rainmaker-base-cdf
```

### pnpm

```bash
pnpm add @espressif/rainmaker-base-cdf
```

---

## Quick Start

### 1. Register adaptor(s) and initialize CDF

```ts
import { AdaptorRegistry, initCDF } from "@espressif/rainmaker-base-cdf";
// import { ESPRMBaseSDKAdaptor } from "<your-adaptor-package>";

const sdkAdaptorRegistry = AdaptorRegistry.getInstance();
sdkAdaptorRegistry.clear();

// Register one or more adaptors that implement ESPSDKAdaptor
// const esprmAdaptor = new ESPRMBaseSDKAdaptor({ ...config });
// sdkAdaptorRegistry.register(esprmAdaptor);
// sdkAdaptorRegistry.setActiveAdaptor(esprmAdaptor._identifier);

const cdf = await initCDF({ sdkAdaptorRegistry });
```

### 2. Authenticate through the active adaptor

```ts
await cdf.userStore.auth.login({
  username: "user@example.com",
  password: "password",
});

const user = cdf.userStore.user;
```

### 3. Fetch groups and nodes using unified entities

For multi-adaptor flows, you can resolve the **authorization entity** per adaptor. After login, `userStore.user` is often the right handle:

```ts
if (!user) throw new Error("No active user");

await user.getGroups();
const groups = cdf.groupStore.groupsList;

const group = groups[0];
if (group) {
  await group.getNodes();
}

const nodes = cdf.nodeStore.nodesList;
```

### 4. Update entities with unified APIs

```ts
const automation = cdf.automationStore.getAutomationById("automation-id");
if (automation) {
  await automation.update({ name: "New Automation Name", enabled: true });
}
```

---

## Core responsibilities

CDF separates concerns so app code stays **adaptor-agnostic**:

- **Adaptors** translate between source types and CDF entities.
- **Entities** delegate operations and emit typed events.
- **Synchronizers** centralize entity/store updates and cross-store coordination.
- **Stores** expose observable entities for reactive UIs.

---

## Resources

- [Changelog](CHANGELOG.md)
- [API Documentation](https://espressif.github.io/esp-rainmaker-app-cdf-ts/)

## License

This project is licensed under the Apache 2.0 license - see the [LICENSE](LICENSE) file for details.
