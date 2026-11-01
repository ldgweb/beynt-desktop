fn main() {
    // tauri-build watches only its configuration: without this a new icon stays out of the executable.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
