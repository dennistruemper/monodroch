import { Runtime } from "foldkit";

import {
  Message,
  Model,
  init,
  managedResources,
  subscriptions,
  update,
  view,
} from "./main";

const container = document.getElementById("app");
if (!container) {
  throw new Error("[communicolor] Missing #app container");
}

const program = Runtime.makeProgram({
  Model,
  init,
  update,
  view,
  container,
  managedResources,
  subscriptions,
  devTools: {
    Message,
    excludeFromHistory: ["ReceivedState"],
  },
});

Runtime.run(program);
