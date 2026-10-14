# Finot mobile app

The student companion app for [Finot](../README.md), the Gibi Gubae fellowship platform.
Built with **Expo (React Native) and TypeScript**, using Expo Router for navigation.

It talks to the same API as the website (`https://finot-api.onrender.com`); there is no separate backend.

## Run it

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your phone (the phone and the computer must be on the same
Wi-Fi; if that does not work, run `npx expo start --tunnel`).

## Status

Work in progress, built step by step. See the commit history for each step.

| Step | What |
|---|---|
| 1 | Project created and running on a phone |
| 2 | First screen: View, Text, Pressable, StyleSheet, useState |
| 3 | Navigation: tabs, protected routes, sign-in screen (fake session) |
| 4 | API client (`apiRequest`), server data types, live server check |
