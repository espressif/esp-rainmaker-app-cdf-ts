# ESP Rainmaker Typescript Base CDF

The **@espressif/rainmaker-base-cdf** package is a reactive state management library for Rainmaker applications, built on MobX, offering seamless state synchronization through predefined stores (`GroupStore`, `NodeStore`, `UserStore`, `SubscriptionStore`). It automatically updates with backend API calls via **@espressif/rainmaker-base-sdk**, ensuring efficient data flow and real-time reactivity

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Resources](#resources)
- [License](#license)
- [API Documentation](https://espressif.github.io/esp-rainmaker-app-cdf-ts/)

---

## Overview

The `@espressif/rainmaker-base-cdf` package is a reactive state management library designed for Rainmaker applications. Built with MobX at its core, it provides a seamless and efficient way to manage and synchronize application state through its predefined stores: `GroupStore`, `NodeStore`, `UserStore`, and `SubscriptionStore`. These stores automatically update when backend APIs are called through the `@espressif/rainmaker-base-sdk` package, ensuring robust data handling and communication. This simplifies data flow and keeps your application effortlessly reactive and up-to-date.

---

## Key Features

- [x] **Reactive State Management:** Provides prebuilt reactive stores (`GroupStore`, `NodeStore`, `UserStore`, and `SubscriptionStore`) using MobX, ensuring seamless state synchronization and updates.
- [x] **Backend Integration with `@espressif/rainmaker-base-sdk`:** Automatically manages API calls through the `@espressif/rainmaker-base-sdk` package, reducing the need for repetitive backend setup.
- [x] **Effortless Initialization:** Automatically initializes the `@espressif/rainmaker-base-sdk` package with minimal configuration, requiring only SDK and CDF setup.
- [x] **Unified Data Flow:** Offers a centralized, reactive layer for managing data from Rainmaker backend services, streamlining app development.
- [x] **Modular and Scalable:** Provides a flexible architecture to suit both simple and complex Rainmaker applications, supporting extensibility and maintainability.

---

## Requirements

Before installing the `@espressif/rainmaker-base-cdf` package, ensure you meet the following prerequisites:

- **Node.js**: Version 20.17.0 or higher is recommended.
- **Package Manager**: Any one from npm, yarn, or pnpm installed.

---

## Installation

To use the `@espressif/rainmaker-base-cdf` package in your project, follow the steps below:

Install `@espressif/rainmaker-base-cdf` using the following command:

### Using npm

```bash
npm install @espressif/rainmaker-base-cdf
```

### Using Yarn

```bash
yarn add @espressif/rainmaker-base-cdf
```

### Using pnpm

```bash
pnpm add @espressif/rainmaker-base-cdf
```

After installation, you can import and initialize the package in your project to start using the reactive stores.

---

## Usage

Below are examples to help you get started with the `@espressif/rainmaker-base-cdf` package in your application:

### 1. **Initialization**

Initialize the `@espressif/rainmaker-base-cdf` package by providing the required configuration. This automatically sets up the necessary reactive stores.

```javascript
import { initCDF } from "@espressif/rainmaker-base-cdf";

const initApp = async () => {
  const sdkConfiguration = {
    baseUrl: "https://api.rainmaker.espressif.com",
    version: "v1",
  };
  try {
    const espCDF = await initCDF(sdkConfiguration, { autoSync: true });
    console.log("Rainmaker Base CDF initialized:", espCDF);
  } catch (error) {
    console.error("Initialization error:", error);
  }
};
initApp();`
```

---

### 2. **User Authentication**

Use the `UserStore` for logging in and managing user-related data.

#### Example: Login

```javascript
const handleConnect = async () => {
  try {
    await espCDF.userStore.login(username, password);
    console.log("User logged in successfully");
  } catch (error) {
    console.error("Login error:", error);
  }
};
```

#### Example: Accessing User Info

```javascript
if (espCDF.userStore.userInfo) {
  console.log("User Info:", espCDF.userStore.userInfo);
}
```

---

### 3. **Working with Nodes**

Use the `NodeStore` to interact with node data.

#### Example: Fetching Nodes

```javascript
const nodes = espCDF.nodeStore.nodeList;
console.log("Nodes:", nodes);
```

#### Example: Reactively Handling Node Updates

```javascript
useEffect(() => {
  console.groupCollapsed("Node list updated");
  console.log(espCDF.nodeStore.nodeList);
  console.groupEnd();
}, [espCDF.nodeStore.nodeList]);
```

---

### 4. **Working with Groups**

Use the `GroupStore` to manage group data.

#### Example: Fetching Groups

```javascript
const groups = espCDF.groupStore.groupList;
console.log("Groups:", groups);
```

#### Example: Handling Group Updates

```javascript
useEffect(() => {
  console.groupCollapsed("Group list updated");
  console.log(espCDF.groupStore.groupList);
  console.groupEnd();
}, [espCDF.groupStore.groupList]);
```

---

### 5. **Working with Scenes**

Use the `SceneStore` to manage scene data and operations.

#### Example: Fetching Scenes

```javascript
espCDF.sceneStore.syncScenesFromNodes();
const scenes = espCDF.sceneStore.sceneList;
console.log("Scenes:", scenes);
```

#### Example: Creating and Managing Scenes

```javascript
// Create a new scene
const newScene = await espCDF.sceneStore.createScene({
  name: "Living Room Scene",
  nodes: ["node1", "node2"],
  actions: {
    node1: { light: { power: true, brightness: 80 } },
    node2: { fan: { power: false } },
  },
});

// Activate a scene
await espCDF.sceneStore.activateScene("scene123");

// Remove a scene
const scene = espCDF.sceneStore.getScene("scene123");
if (scene) await scene.remove();
```

#### Example: Handling Scene Updates

```javascript
useEffect(() => {
  console.groupCollapsed("Scene list updated");
  console.log(espCDF.sceneStore.sceneList);
  console.groupEnd();
}, [espCDF.sceneStore.sceneList]);
```

---

### 6. **Working with Schedules**

Use the `ScheduleStore` to manage time-based device operations.

```javascript
// Create a schedule
const schedule = await espCDF.scheduleStore.createSchedule({
  name: "Morning Routine",
  nodes: ["bedroom_light"],
  action: {
    bedroom_light: { light: { power: true } }
  },
  triggers: [{ m: 420, d: 127 }] // 7:00 AM daily
});

// Manage schedules
const schedules = espCDF.scheduleStore.scheduleList;
await espCDF.scheduleStore.enableSchedule("schedule123");
await espCDF.scheduleStore.disableSchedule("schedule123");

// Handle updates
useEffect(() => {
  console.log("Schedules updated:", espCDF.scheduleStore.scheduleList);
}, [espCDF.scheduleStore.scheduleList]);
```

---

### 7. **Working with Automations**

Use the `AutomationStore` to manage context-aware automations.

```javascript
// Access automations by type
const allAutomations = espCDF.automationStore.automationList;
const weatherAutomations = espCDF.automationStore.weatherAutomationList;
const daylightAutomations = espCDF.automationStore.daylightAutomationList;

// Manage automations
const nodeAutomations = espCDF.automationStore.getAutomationsByNodeId("node123");
const locationAutomations = espCDF.automationStore.getWeatherAutomationsByLocation({
  latitude: 37.7749,
  longitude: -122.4194
});

// Update automation
const automation = espCDF.automationStore.getAutomationById("automation123");
if (automation) {
  await automation.updateName("New Name");
  await automation.enable(true);
}
```

## Resources

- [Changelog](CHANGELOG.md)

## License

This project is licensed under the Apache 2.0 license - see the [LICENSE](LICENSE) file for details.
