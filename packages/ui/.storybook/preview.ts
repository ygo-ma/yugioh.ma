// oxlint-disable-next-line import/no-unassigned-import
import "../src/main.css";
import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
  },
};

export default preview;
