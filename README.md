# Vue SFC Loader

Single File Component loader for Vue3. Load .vue files directly from your HTML. No node.js environment, no build step.

## Installation

Install @vuebro/sfc-loader with npm

```bash
npm install @vuebro/sfc-loader
```

## Usage/Examples

[Documentation oт Async Components](https://vuejs.org/guide/components/async)

To load .vue files dynamically at runtime just use loadModule function:

```javascript
<script setup>
import { defineAsyncComponent } from "vue";
import loadModule from "@vuebro/sfc-loader";

const AdminPage = defineAsyncComponent(() =>
  loadModule('./components/AdminPageComponent.vue')
);
</script>

<template>
  <AdminPage />
</template>
```
