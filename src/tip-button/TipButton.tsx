import { Button } from '@mui/material';

export function TipButton() {
  return (
    <Button
      variant="contained"
      sx={{
        textTransform: 'none',
        fontWeight: 600,
      }}
      href="https://ko-fi.com/G2G1RBUDB"
      target="_blank"
    >
      <img
        src="https://storage.ko-fi.com/cdn/cup-border.png"
        alt="Ko-fi donations"
        className="kofiimg"
        style={{
          height: '13px',
          width: '20px',
          marginRight: '8px',
        }}
      />
      <span
        style={{
          color: 'white',
        }}
      >
        Tip me on Ko-fi
      </span>
    </Button>
  );
}
