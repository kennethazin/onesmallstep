use crate::consts::special::*;
use crate::mem::MemoryType;
use heapless::spsc::Producer;
#[derive(Clone)]
pub struct SpecialRegisters {
    pub cdu: (u16, u16, u16),
    pub opt: (u16, u16),
    pub pipa: (u16, u16, u16),
    pub inlink: u16,
}

impl SpecialRegisters {
    pub fn new(_rupt_tx: Producer<u8, 8>) -> Self {
        Self {
            cdu: (0, 0, 0),
            inlink: 0,
            opt: (0, 0),
            pipa: (0, 0, 0),
        }
    }

    #[allow(dead_code)]
    pub fn reset(&mut self) {}
}

impl MemoryType for SpecialRegisters {
    fn read(&self, bank_idx: usize, bank_offset: usize) -> u16 {
        if bank_idx != 0 {
            return 0;
        }

        match bank_offset {
            SG_CDUX => self.cdu.0,
            SG_CDUY => self.cdu.1,
            SG_CDUZ => self.cdu.2,
            SG_OPTX => self.opt.0,
            SG_OPTY => self.opt.1,
            SG_PIPAX => self.pipa.0,
            SG_PIPAY => self.pipa.1,
            SG_PIPAZ => self.pipa.2,

            // Inlink and Outlink Registers
            SG_INLINK => self.inlink,
            SG_OUTLINK => 0,
            SG_CDUXCMD | SG_CDUYCMD | SG_CDUZCMD => 0,
            _ => 0,
        }
    }

    fn write(&mut self, _bank_idx: usize, bank_offset: usize, value: u16) {
        match bank_offset {
            SG_CDUX | SG_CDUY | SG_CDUZ | SG_OPTX | SG_OPTY | SG_PIPAX | SG_PIPAY | SG_PIPAZ => {}

            // Inlink and Outlink Registers
            SG_INLINK => {
                self.inlink = value & 0x7FFF;
            }
            SG_OUTLINK => {}

            _ => {}
        }
    }
}
