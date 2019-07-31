/* jslint node: true */
module.exports = function (grunt) {
  return {
    main: {
      options: {
        patterns: [
          {
            match: 'version',
            replacement: grunt.option('app-version') || '2.0.0-dev'
          }
        ]
      },
      files: [
        {
          expand: true,
          flatten: true,
          src: ['dist/app.*.js'],
          dest: 'dist/'
        }
      ]
    }
  };
};
