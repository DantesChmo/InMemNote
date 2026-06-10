// swift-tools-version: 5.9
//
// WindowEventsCore — AppKit-side of the Inmemnote native addon. Built as a
// static library so node-gyp can link it into the .node binary. The C ABI
// exposed via @_cdecl lives in Bridge.swift; the manual C header
// `src/InmemnoteBridge.h` is the contract the .mm shim imports.
import PackageDescription

let package = Package(
  name: "WindowEventsCore",
  platforms: [.macOS(.v10_15)],
  products: [
    .library(name: "WindowEventsCore", type: .static, targets: ["WindowEventsCore"])
  ],
  targets: [
    .target(name: "WindowEventsCore")
  ]
)
