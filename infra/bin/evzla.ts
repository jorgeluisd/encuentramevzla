import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { buildApp } from "../lib/app.js";

const app = new App();
buildApp(app, fileURLToPath(new URL("..", import.meta.url)));
app.synth();
