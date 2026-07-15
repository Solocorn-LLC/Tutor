import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'coverage/',
      'playwright-report/',
      'playwright-report/**',
      'test-results/',
      'test-results/**',
      'node_modules/',
      'node_modules/**',
      'next-env.d.ts',
      'public/**',
      '*.min.js',
      '*.min.mjs',
      'package.json.tmp',
      'pkg_head.json',
      'pkg_head2.json',
      'server-production.js',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'import/no-anonymous-default-export': 'off',
      '@next/next/no-img-element': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-assign-module-variable': 'off',
      'react/no-unescaped-entities': 'off',
      'react/jsx-no-undef': 'off',
      'react/no-children-prop': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'jsx-a11y/alt-text': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-proto': 'error',
      'no-iterator': 'error',
      'no-extend-native': 'error',
      'no-with': 'error',
      'no-caller': 'error',
      'no-unsafe-finally': 'error',
      // Variant-family guard: reading enrollments by a session's courseId
      // (eq(courseEnrollment.courseId, someSession.courseId)) silently misses
      // students enrolled under the sibling course variant (template vs
      // published). Use expandToCourseFamily(...) + inArray(...). The `course`
      // join and single-id/cast forms are intentionally not matched.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='eq'][arguments.0.object.name='courseEnrollment'][arguments.0.property.name='courseId'][arguments.1.type='MemberExpression'][arguments.1.property.name='courseId']:not([arguments.1.object.name='course'])",
          message:
            "Filtering courseEnrollment by a session's courseId misses students under the sibling course variant. Use `inArray(courseEnrollment.courseId, await expandToCourseFamily([<id>]))`. See variant-family.ts.",
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.{js,ts}', 'src/scripts/**/*.{js,ts}'],
    rules: {
      '@next/next/no-assign-module-variable': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: ['public/**/*.{js,mjs}'],
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
]

export default [...config]
