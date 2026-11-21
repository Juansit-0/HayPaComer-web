# HayPaComer web

The web UI of **HayPaComer**, the smart fridge that answers "what can I cook right now with what is actually at home?". Work happens here and goes straight to `main`; the history up to version 1.1.0 comes from the monorepo [Juansit-0/HayPaComer](https://github.com/Juansit-0/HayPaComer), with each commit kept under its original author.

Live: https://haypacomer.jenilarper.dev (API docs at [/docs](https://haypacomer.jenilarper.dev/docs)).

## What is here

The interface served by Spring Boot, written as vanilla ES modules with no build step:

- `index.html` and `app/`: the five screens (Now, Fridge, Market, Numbers, Chef) plus Settings, live updates over SSE, voice commands, and the language switch;
- `assets/`: brand tokens, logos, and the design notes used at build time.

The backend serves this folder from `web/src/main/resources/static`, with `assets/` copied to `brand/assets`; its Dockerfile pulls this repository's `main` tarball at build time.

## Run

The UI is served by the backend at `http://localhost:8080`; see the `HayPaComer-backend` README (Build) for the setup that copies this repository into the backend.
