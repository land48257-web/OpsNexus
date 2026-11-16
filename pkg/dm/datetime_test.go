package dm

import (
	"encoding/binary"
	"testing"
)

func TestBDTANanosecondDecode(t *testing.T) {
	for _, nsec := range []uint32{0, 255, 256, 65536, 123456, 123456789, 999999999} {
		value := make([]byte, 13)
		binary.LittleEndian.PutUint16(value, 2026)
		value[2], value[3] = 11, 6
		value[7], value[8], value[9], value[12] = byte(nsec), byte(nsec>>8), byte(nsec>>16), byte(nsec>>24)
		dt := dmdtDecodeBdta(value)
		if dt[OFFSET_NANOSECOND] != int(nsec) {
			t.Errorf("nanoseconds: got %d want %d", dt[OFFSET_NANOSECOND], nsec)
		}
		if nsec < 1<<24 {
			dt = dmdtDecodeBdta(value[:12])
			if dt[OFFSET_NANOSECOND] != int(nsec) {
				t.Errorf("12-byte nanoseconds: got %d want %d", dt[OFFSET_NANOSECOND], nsec)
			}
		}
	}
}
