import { App } from "aws-cdk-lib";
import { buildCiApp } from "../lib/ci-app.js";

const app = new App();
buildCiApp(app);
app.synth();
