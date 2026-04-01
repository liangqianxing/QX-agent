import { Box } from "ink";
import type { PropsWithChildren } from "react";

export function App({ children }: PropsWithChildren): JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {children}
    </Box>
  );
}
