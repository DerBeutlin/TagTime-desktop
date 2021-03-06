/**
 * build: Build an istanbul coverage instrumented version of the app
 * cover:e2e: Run the e2e tests on it, outputting istanbul raw coverage data to COVERAGE_DIR
 */
/* eslint-disable no-console */

const gulp = require("gulp");
const mocha = require("gulp-mocha");
const sourcemaps = require("gulp-sourcemaps");
const ts = require("gulp-typescript");
const sass = require("gulp-sass");
const patch = require("gulp-apply-patch");

const path = require("path");
const del = require("del");
const child_process = require("child_process");
const mkdirp = require("mkdirp");
const fs = require("fs");

const BASE_DIR = path.resolve(".");
const BUILD_DIR = path.join(BASE_DIR, "app");
const COVERAGE_ROOT_DIR = path.join(BASE_DIR, "coverage");
const COVERAGE_DIR = path.join(COVERAGE_ROOT_DIR, "e2e-collection");
const REPORT_DIR = path.join(COVERAGE_ROOT_DIR, "raw", "e2e-report");
const NYC_DIR = path.join(COVERAGE_ROOT_DIR, "raw");
const PATCHED_MODULES_DIR = path.join(BUILD_DIR, "node_modules");
const PATCHES_DIR = path.join(BASE_DIR, "patches");
const NODE_MODULES = path.join(BASE_DIR, "node_modules");
const paths = {
  sources: {
    paths: ["src/**/*.[tj]s?(x)", "src/types/**/*.d.ts"],
    onchange: "compile"
  },
  sass: { paths: ["./src/**/*.scss"], onchange: "compile:sass" },
  tests: {
    paths: ["test/**/*.[jt]s", "src/types/global.d.ts"],
    onchange: "compile:tests"
  },

  // gulp.watch <v4 is broken but not documented as such. https://github.com/gulpjs/gulp/issues/651
  // expect to see this watch picking up changes under ./app !
  static: { paths: ["./src/*.html"], onchange: "copy" }
};

// Need separate projects for parallel builds
// According to the docs, must be defined outside of the task they're used in
const tsProjectBuild = ts.createProject("tsconfig.json");
const tsProjectTests = ts.createProject("tsconfig.json");

gulp.task("patch", function() {
  // Get all the directories in the patches folder
  let to_patch = fs
    .readdirSync(PATCHES_DIR)
    .filter(f => fs.statSync(path.join(PATCHES_DIR, f)).isDirectory());

  // If there's only a single entry in the patches directory, the {set glob} won't match, so
  // add a dummy entry to work around that
  to_patch.push("nonexistent_dummy_package");

  // Convert the patch directories into a glob that matches the corresponding source packages.
  let globs_to_patch = NODE_MODULES + "/{" + to_patch.join(",") + "}/**/*";

  return gulp
    .src(globs_to_patch, { base: NODE_MODULES }) // copy only the modules that have patches
    .pipe(patch(PATCHES_DIR + "/**/*.patch"))
    .pipe(gulp.dest(PATCHED_MODULES_DIR));
});

gulp.task("compile", function() {
  return gulp
    .src(paths.sources.paths, { base: "./" })
    .pipe(sourcemaps.init())
    .pipe(tsProjectBuild())
    .js // discard the type outputs (.dts)
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task("compile:tests", function() {
  return gulp
    .src(paths.tests.paths, { base: "./" })
    .pipe(tsProjectTests())
    .js // discard the type outputs (.dts)
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task("compile:sass", function() {
  return gulp
    .src(paths.sass.paths, { base: "./" })
    .pipe(sourcemaps.init())
    .pipe(sass().on("error", sass.logError))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(BUILD_DIR));
});

// Get any non-js components of the app
gulp.task("copy", function() {
  return gulp
    .src(paths.static.paths, { base: "./" })
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task("clean:build", function() {
  return del([BUILD_DIR]);
});
gulp.task("clean:coverage", function() {
  return del([COVERAGE_DIR]);
});
gulp.task("clean:report", function() {
  return del([REPORT_DIR]);
});

// Note we aren't running clean:build before this, because it was a pain in combo with watch.
gulp.task("build", ["compile", "compile:sass", "copy", "patch"]);
gulp.task("build:tests", ["compile:tests", "build"]);

gulp.task("cover:e2e", ["build:tests", "clean:coverage"], function() {
  // TODO: this previously depended on babel's istanbul plugin? removed when babel broke, but coverage wasn't working then anyway
  // The e2e tests will pick this up and launch our instrumented app
  process.env.TAGTIME_E2E_COVERAGE_DIR = COVERAGE_DIR;
  process.env.NODE_ENV = "coverage";
  mkdirp.sync(COVERAGE_ROOT_DIR);
  mkdirp.sync(COVERAGE_DIR);
  return gulp.src(["app/test/e2e/*.[tj]s"]).pipe(mocha());
});

gulp.task("report:e2e", ["cover:e2e", "clean:report"], function() {
  mkdirp.sync(REPORT_DIR);
  // tried reporting with writeReports, and it didn't seem to support specifying where the coverage
  // root dir was - it seems to be designed to be used in the inline / unit test case, not the
  // browser case
  let text_report = child_process.execSync(
    "./node_modules/.bin/istanbul report json text-summary " +
      `--root='${COVERAGE_DIR}' --dir='${REPORT_DIR}'`
  );
  process.stdout.write(text_report);
  fs.renameSync(
    path.join(REPORT_DIR, "coverage-final.json"),
    path.join(NYC_DIR, "e2e.json")
  );

  // Remove the coverage dir else istanbul will fail when trying to build the overall combined
  // report. Don't use a clean:cover dependency because it will already have run once so gulp won't
  // run it again.
  return del([REPORT_DIR, COVERAGE_DIR]);
});

gulp.task("watch", () => {
  for (let p in paths) {
    gulp.watch(paths[p].paths, function(event) {
      console.log("File " + event.path + " was " + event.type + "...");
      gulp.start(paths[p].onchange);
    });
  }
});

gulp.task("default", ["watch", "build:tests"]);
