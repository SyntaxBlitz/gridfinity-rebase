import {
  Box,
  Button,
  FormControlLabel,
  Link,
  Stack,
  Switch,
} from '@mui/material';
import { useState } from 'react';
import { TipButton } from './tip-button/TipButton.tsx';

export function Intro({
  bypassRotationForInputFile,
  setBypassRotationForInputFile,
  bypassRotationForGoldFile,
  setBypassRotationForGoldFile,
}: {
  bypassRotationForInputFile: boolean;
  setBypassRotationForInputFile: (bypass: boolean) => void;
  bypassRotationForGoldFile: boolean;
  setBypassRotationForGoldFile: (bypass: boolean) => void;
}) {
  const [moreInfoExpanded, setMoreInfoExpanded] = useState(false);

  return (
    <Stack
      spacing={2}
      sx={{
        maxWidth: 'calc(min(960px, 80%))',
      }}
    >
      <Box>
        <Link
          href="https://gridfinity.tools/"
          sx={{
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline',
              textDecorationColor: '#777',
            },
          }}
        >
          {/* i think this is some emotion weirdness */}
          <span style={{ color: '#777' }}>gridfinity.tools/</span>
        </Link>
      </Box>
      <Stack
        alignItems="center"
        direction="row"
        justifyContent="space-between"
        gap={2}
        pb={2}
      >
        <h1
          style={{
            margin: 0,
          }}
        >
          Gridfinity Rebase
        </h1>

        <TipButton />
      </Stack>

      <Box>
        Once you have a magnet strategy you're happy with — whether you're
        gluing them, press-fitting them, capturing them, or just omitting them
        altogether — you'll want all of your printed modules to use the same
        strategy.
      </Box>
      <Box>
        This tool automatically finds bases in the STL file you need to print,
        then <strong>cuts them out and replaces them</strong> with your
        preferred base.
      </Box>
      <Box>
        CAD operations are performed in your browser using the web build of{' '}
        <a href="https://gridfinity.tools/#openscad">OpenSCAD</a> (no files
        leave your machine).
      </Box>
      <Box>
        I'm <a href="https://timothyaveni.com">Tim</a>, and I built this
        software, which is free and open-source (
        <a href="https://github.com/syntaxblitz/gridfinity-rebase">
          GitHub link
        </a>
        ). I hope you find it helpful!
        {/* not sure this is the right spot for this plug */}
        {/* You can find links to other tools at{' '}
        <a href="https://gridfinity.tools">gridfinity.tools</a>. */}
      </Box>
      <Button
        onClick={() => setMoreInfoExpanded(!moreInfoExpanded)}
        sx={{ alignSelf: 'flex-end' }}
      >
        More info ↓
      </Button>
      <Stack
        spacing={2}
        sx={{
          display: moreInfoExpanded ? 'flex' : 'none',

          border: '1px solid #ddd',
          backgroundColor: '#f9f9f9',
          m: 4,
          p: 2,
        }}
      >
        <h3>How are bases detected?</h3>
        <Box>
          The tool looks at the shapes made up by points at the very bottom of
          the model. It computes convex hulls of these shapes, which should
          match the typical rounded 35.6mm square base of a Gridfinity cell. It
          checks all 6 possible rotations of the model, choosing a rotation
          where those bottom shapes most look like 35.6mm squares.
        </Box>
        <Box>
          Then, the center of each shape is used as the center of a cutout
          point. OpenSCAD code is generated to cut out a shape approximately
          containing a typical base (2.6mm high for the 42x42 square and 5.5mm
          high for the 34x34 central portion) and replace it with that same
          cutout from your preferred base (which is itself located in the same
          way as in the file being fixed).
        </Box>
        <h3>What doesn't work?</h3>
        <Box>
          Gridfinity is a pretty loosely-defined specification, and people have
          gotten clever with it. Here are some things this tool isn't designed
          to handle:
        </Box>
        <ul>
          <li>Nonstandard base sizes (i.e. non-42mm grid)</li>
          <li>“Half-pitch” modules</li>
          <li>
            “Eco” bins without a thick base, like those by{' '}
            <a href="https://github.com/jrymk/gridfinity-eco">jerrymk</a>
          </li>
          <li>STL files in units other than mm (e.g. off by orders of 10)</li>
          <li>STL files that are not manifold</li>
          <li>
            Bases that are different or rotated for different parts of a bin,
            like “magnets only in corners” of large bins (but you can always
            just print all the holes and then not place all the magnets!)
          </li>
        </ul>
        <Box>
          The tool should work fine on STLs that are off-center or rotated 90 or
          180 degrees. If you find a module out in the wild that doesn't work,{' '}
          <a href="mailto:me@timothyaveni.com">let me know</a> about it!
        </Box>
        <Stack spacing={2}>
          <Box>
            In some circumstances, you might want to turn off the automatic
            rotation detection (e.g. when using bases with a nonstandard bottom
            size, like <a href="https://snapfit.nl/">Snapfit</a>). Using the
            following controls will make the tool “trust” the rotation of the
            input files, even if the bases don't look right.
          </Box>

          <Stack direction="column" alignItems="flex-start" alignSelf="center">
            <FormControlLabel
              control={
                <Switch
                  checked={!bypassRotationForInputFile}
                  onChange={(e) =>
                    setBypassRotationForInputFile(!e.target.checked)
                  }
                />
              }
              label={
                <>
                  Rotation detection for <strong>input file</strong>
                </>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={!bypassRotationForGoldFile}
                  onChange={(e) =>
                    setBypassRotationForGoldFile(!e.target.checked)
                  }
                />
              }
              label={
                <>
                  Rotation detection for <strong>replacement base</strong>
                </>
              }
            />
          </Stack>
        </Stack>

        <h3>How does OpenSCAD run in the browser?</h3>
        <Box>
          I used Olivier Chafik's excellent{' '}
          <a href="https://github.com/openscad/openscad-playground">
            openscad-playground
          </a>{' '}
          project as a reference for using the compiled{' '}
          <a href="https://github.com/openscad/openscad-wasm">openscad-wasm</a>{' '}
          binary. The new{' '}
          <a href="https://github.com/openscad/openscad/pull/4533">Manifold</a>{' '}
          backend is critical to make this project practical; rebases can
          otherwise take a minute or two, even on simple models. The desktop
          version of OpenSCAD is faster than the WASM build, but not
          dramatically so.
        </Box>
      </Stack>
    </Stack>
  );
}
