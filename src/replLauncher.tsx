import React from "react";
import { render } from "ink";
import type { Props as REPLProps } from "./screens/REPL.js";

export async function launchRepl(replProps: REPLProps): Promise<void> {
  const [{ App }, { REPL }] = await Promise.all([
    import("./components/App.js"),
    import("./screens/REPL.js"),
  ]);

  const app = render(
    <App>
      <REPL {...replProps} />
    </App>,
  );

  await app.waitUntilExit();
}
