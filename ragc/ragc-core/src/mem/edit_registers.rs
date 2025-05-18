use crate::consts::edit::*;
use crate::mem::MemoryType;
use log::{error, trace};

#[derive(Clone)]
pub struct EditRegisters {
    cyr: u16,
    sr: u16,
    cyl: u16,
    edop: u16,
}

impl EditRegisters {
    pub fn new() -> Self {
        Self {
            cyl: 0,
            cyr: 0,
            sr: 0,
            edop: 0,
        }
    }

    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.cyl = 0;
        self.cyr = 0;
        self.sr = 0;
        self.edop = 0;
    }
}

impl MemoryType for EditRegisters {
    fn read(&self, _bank_idx: usize, bank_offset: usize) -> u16 {
        trace!("Edit Read: 0o{:o}", bank_offset);
        match bank_offset {
            SG_CYL => self.cyl,
            SG_CYR => self.cyr,
            SG_SR => self.sr,
            SG_EDOP => self.edop,
            _ => {
                error!("Invalid EditRegister Read: 0o{:o}", bank_offset);
                0
            }
        }
    }

    fn write(&mut self, _bank_idx: usize, bank_offset: usize, value: u16) {
        let newval = value & 0x7FFF;
        trace!("Edit Write: 0o{:o}", bank_offset);

        match bank_offset {
            SG_CYL => {
                let bitval = newval & 0x4000;
                self.cyl = (newval << 1) & 0x7FFF;
                self.cyl |= bitval >> 14;
            }
            SG_CYR => {
                let bitval = newval & 0x1;
                self.cyr = (newval >> 1) | (bitval << 14)
            }
            SG_SR => {
                let bitval = newval & 0o40000;
                self.sr = (newval >> 1) | bitval;
            }
            SG_EDOP => self.edop = (newval >> 7) & 0o177,
            _ => {
                error!("Invalid EditRegister Write: {:o}", bank_offset);
            }
        }
    }
}
