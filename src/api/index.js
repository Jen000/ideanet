/**
 * Single entry point for all persistence.
 *
 * Every component imports from here and nowhere else, so swapping the demo
 * store for AWS is a one-line change in this file. Both adapters must export
 * the same surface — see the contract in ./aws.js.
 */
export { api, summarize, score } from "./local";
// export { api, summarize, score } from "./aws";
