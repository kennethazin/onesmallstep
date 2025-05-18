use crate::consts;
use crate::mem::MemoryType;
use crate::utils::Option;

#[allow(dead_code)]
const DATA_LINE_NUM_PARTS: usize = 8;
#[allow(dead_code)]
const DATA_LINE_PART_LEN: usize = 6;

pub struct Rom<'a> {
    program: Option<&'a [[u16; consts::ROM_BANK_NUM_WORDS]; consts::ROM_NUM_BANKS]>,
}
impl<'a> MemoryType for Rom<'a> {
    fn read(&self, bank_idx: usize, bank_offset: usize) -> u16 {
        if bank_idx >= consts::ROM_NUM_BANKS || bank_offset >= consts::ROM_BANK_NUM_WORDS {
            return 0x0;
        }
        match self.program {
            Option::Some(program) => {
                const BANK_IDX_REF: [usize; 36] = [
                    2, 3, 0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
                    22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
                ];
                (u16::from_be(program[BANK_IDX_REF[bank_idx]][bank_offset]) >> 1) & 0x7FFF
            }
            _ => 0,
        }
    }

    fn write(&mut self, bank_idx: usize, bank_offset: usize, _value: u16) {
        if bank_idx >= consts::ROM_NUM_BANKS || bank_offset >= consts::ROM_BANK_NUM_WORDS {
            return;
        }
    }
}

impl<'a> Rom<'a> {
    pub fn new(program: &'a [[u16; consts::ROM_BANK_NUM_WORDS]; consts::ROM_NUM_BANKS]) -> Rom<'a> {
        Rom {
            program: Option::Some(program),
        }
    }

    pub fn blank() -> Rom<'a> {
        Rom {
            program: Option::None,
        }
    }
}
