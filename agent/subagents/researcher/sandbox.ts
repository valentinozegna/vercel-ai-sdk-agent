import { defineParentSandbox } from "eve/sandbox";

// The researcher only reads the web; it borrows the parent's sandbox instead of starting its own.
export default defineParentSandbox();
