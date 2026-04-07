# Changelog

All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and follows the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.

## [v2.0.0]

> Major CDF revamp with a unified, SDK-agnostic architecture.
> Includes support for RainMaker base SDK adapter ([`v2.0.4`](https://www.npmjs.com/package/@espressif/rainmaker-base-sdk/v/2.0.4)).

### Added

- **Unified CDF Layer**:
  - Re-architected CDF as a unified abstraction layer that can adapt to multiple SDK implementations.
  - Standardized integration points to support pluggable SDK adapters.

- **Entities Layer**:
  - Added the `entities`-driven engine layer (`src/entities`) as the app-facing abstraction.
  - Provides a unified contract for applications to consume CDF capabilities consistently across SDK adapters.

- **SDK Registry Layer**:
  - Added an SDK registry mechanism to register, resolve, and switch SDK adapters consistently.
  - Enabled clearer separation between CDF domain logic and SDK-specific transport/runtime behavior.

### Changed

- **Architecture**:
  - This release is a complete architectural overhaul of CDF and is published as a major version (`v2.0.0`).
  - Existing integrations may require migration to the new unified layer and registry-driven SDK setup.

### Fixed

- **Scene Synchronization**: `syncScenesFromNodes` requires `nodeIds` and transforms scenes only for specified nodes.
- **Pagination**: `fetchNext` handling in `NodeStore`, `GroupStore`, and `AutomationStore` is now consistent.


## [v1.2.0]

> Supports SDK [`v2.0.4`](https://www.npmjs.com/package/@espressif/rainmaker-base-sdk/v/2.0.4)

### Added

- **Schedule Management**:
  - Introduced `scheduleStore` for centralized schedule handling
  - Implemented `Schedule` class with CRUD operations and sync capabilities
  - Added multi-node schedule reconciliation and validation
  - Support for time-based, day-based, and recurring schedules

- **Automation Management**:
  - Introduced `automationStore` for managing smart automations
  - Added support for weather, daylight, and location-based triggers
  - Implemented comprehensive automation APIs:
    - Weather and daylight-based automation creation
    - Geolocation management for context-aware automations
    - Multi-node automation handling and synchronization
  - Added automation update capabilities:
    - Event and action modifications
    - Retrigger control and enabled status management

## [v1.1.1]

> Supports SDK [`v2.0.1`](https://www.npmjs.com/package/@espressif/rainmaker-base-sdk/v/2.0.1)

### Fixed

- **Transport Updates**:
  - Corrected node lookup in subscription store transport listener.

- **Node Updates**:
  - Replaced deepmerge with explicit handlers for devices, params, and config updates.

- **Store Refresh**
  - Added clearing of node and group stores on first-page sync to avoid stale or duplicate entries.

## [v1.1.0]

### Added

- **Scene Management**:
  - Introduced `scenesStore` in `/store` for centralized scene handling.
  - Implemented `Scene` object in `impls/Scene` with comprehensive functionality:
    - Scene creation and modification
    - Scene removal
    - Scene activation
  - Added intelligent scene consolidation for multi-node scenes.

### Fixed

- **Group Management**:
  - Enhanced subgroup deletion logic in group store:
    - Added interceptor to properly remove subgroup references
    - Improved data consistency across parent groups

## [v1.0.1] - 2025-04-23

### Changed

- **Version Upgrade**:
  - Bumped `@espressif/rainmaker-base-sdk` from v1.0.0 to v1.0.1.

- **Code Updates**:
  - Improved imports to ensure compatibility with the updated SDK.

## [v1.0.0] - 2025-01-28

### Added

- **Reactive State Management**:
  - Introduced predefined MobX-based stores for seamless state synchronization:
    - `GroupStore`
    - `NodeStore`
    - `UserStore`
    - `SubscriptionStore`

- **Backend Integration**:
  - Automated API sync via `@espressif/rainmaker-base-sdk` for real-time updates.

- **Effortless Initialization**:
  - Minimal setup required for SDK and CDF integration.

- **Unified Data Flow**:
  - Centralized, reactive layer for managing RainMaker backend services.

- **Modular and Scalable**:
  - Supports both simple and complex applications with extensibility.

This release establishes a solid foundation for scalable **ESP RainMaker** app development.
