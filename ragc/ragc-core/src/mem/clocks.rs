use crate::consts;
use crate::cpu::AgcUnprogSeq;
use crate::mem::MemoryType;

use heapless::Deque;

use log::{debug, error};

#[derive(Clone)]
pub struct Timers {
    time6_enable: bool,

    // Scaler
    scaler: u32,
    pub scaler_mcts: u16,
    downrupt: u32,
    downrupt_flags: u8,

    // Timer Values
    timer1: u32,
    timer3: u16,
    timer4: u16,
    timer5: u16,
    timer6: u16,
}

#[allow(dead_code)]
pub enum TimerType {
    TIME1,
    TIME2,
    TIME3,
    TIME4,
    TIME5,
    TIME6,
}

fn push_unprog_seq(unprog: &mut Deque<AgcUnprogSeq, 8>, seq: AgcUnprogSeq) {
    match unprog.push_back(seq) {
        Err(x) => {
            error!("Unable to push {:?} into UnprogSeq Deque", x);
        }
        _ => {}
    }
}

impl Timers {
    pub fn new() -> Self {
        Self {
            downrupt: 1,
            downrupt_flags: 0,
            time6_enable: false,

            scaler: 0,
            scaler_mcts: 0,

            // Timer values
            timer1: 0,
            timer3: 0,
            timer4: 0,
            timer5: 0,
            timer6: 0,
        }
    }
    pub fn set_downrupt_flags(&mut self, flags: u8) {
        self.downrupt_flags |= flags;
        if self.downrupt_flags == 0x3 {
            self.downrupt_flags = 0x0;
            self.downrupt = 0;
        }
    }

    fn increment_scaler(&mut self, unprog: &mut Deque<AgcUnprogSeq, 8>) -> u16 {
        let mut interrupt_mask = 0;

        self.scaler += 1;
        interrupt_mask |= match self.scaler & 0o37 {
            0 => {
                push_unprog_seq(unprog, AgcUnprogSeq::PINC);
                self.handle_timer5()
            }
            8 => {
                push_unprog_seq(unprog, AgcUnprogSeq::PINC);
                self.handle_timer4()
            }
            16 => {
                push_unprog_seq(unprog, AgcUnprogSeq::PINC);
                push_unprog_seq(unprog, AgcUnprogSeq::PINC);
                self.handle_timer1_timer3(unprog)
            }
            _ => 0,
        };

        if self.time6_enable {
            if self.scaler % 2 == 0o00000 {
                if self.timer6 == 0o77777 || self.timer6 == 0o00000 {
                    self.time6_enable = false;
                    interrupt_mask |= 1 << consts::cpu::RUPT_TIME6;
                } else {
                    push_unprog_seq(unprog, AgcUnprogSeq::DINC);
                    if self.timer6 & 0o40000 == 0o40000 {
                        self.timer6 += 1;
                    } else {
                        self.timer6 -= 1;
                    }
                }
            }
        };
        interrupt_mask
    }

    pub fn pump_mcts(&mut self, mcts: u16, unprog: &mut Deque<AgcUnprogSeq, 8>) -> u16 {
        let mut rupt = 0;
        debug!("SCALARcounter: {:?}", self.scaler_mcts);
        self.scaler_mcts += mcts * 3;
        self.downrupt += mcts as u32;
        if self.downrupt >= 1706 {
            self.downrupt = 0;
            rupt |= self.handle_downrupt();
        }

        rupt |= if self.scaler_mcts >= 80 {
            self.scaler_mcts -= 80;
            self.increment_scaler(unprog)
        } else {
            0
        };
        rupt
    }

    pub fn handle_timer4(&mut self) -> u16 {
        self.timer4 = (self.timer4 + 1) & 0o77777;
        if self.timer4 == 0o40000 {
            self.timer4 = 0;
            return 1 << consts::cpu::RUPT_TIME4;
        }

        0
    }

    pub fn handle_timer5(&mut self) -> u16 {
        self.timer5 = (self.timer5 + 1) & 0o77777;
        if self.timer5 == 0o40000 {
            self.timer5 = 0;
            return 1 << consts::cpu::RUPT_TIME5;
        }

        0
    }

    pub fn set_time6_enable(&mut self, val: bool) {
        self.time6_enable = val;
    }

    pub fn get_time6_enable(&self) -> bool {
        return self.time6_enable;
    }

    pub fn handle_downrupt(&mut self) -> u16 {
        return 1 << consts::cpu::RUPT_DOWNRUPT;
    }

    pub fn handle_timer1_timer3(&mut self, unprog: &mut Deque<AgcUnprogSeq, 8>) -> u16 {
        self.timer1 += 1;
        if self.timer1 & 0o37777 == 0o00000 {
            push_unprog_seq(unprog, AgcUnprogSeq::PINC);
        }

        self.timer3 = (self.timer3 + 1) & 0o77777;
        debug!("New TIMER3: {:o}", self.timer3);
        if self.timer3 == 0o40000 {
            self.timer3 = 0;
            debug!("New TIMER3 interrupt!");
            return 1 << consts::cpu::RUPT_TIME3;
        }

        0
    }

    pub fn set_time_value(&mut self, timer_id: TimerType, value: u16) {
        match timer_id {
            TimerType::TIME1 => {
                self.timer1 = value as u32;
            }
            TimerType::TIME2 => {
                self.timer1 = value as u32;
            }
            TimerType::TIME3 => {
                self.timer3 = value & 0o77777;
            }
            TimerType::TIME4 => {
                self.timer4 = value & 0o77777;
            }
            TimerType::TIME5 => {
                self.timer5 = value & 0o77777;
            }
            TimerType::TIME6 => {
                self.timer6 = value & 0o77777;
            }
        };
    }
    pub fn read_scalar(&self) -> u32 {
        self.scaler
    }

    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.timer1 = 0;
        self.timer3 = 0;
        self.timer4 = 0;
        self.timer5 = 0;
        self.timer6 = 0;
    }
}

impl MemoryType for Timers {
    fn read(&self, _bank_idx: usize, bank_offset: usize) -> u16 {
        let res = match bank_offset {
            consts::timer::MM_TIME2 => ((self.timer1 >> 14) & 0o37777) as u16,
            consts::timer::MM_TIME1 => (self.timer1 & 0o37777) as u16,
            consts::timer::MM_TIME3 => self.timer3,
            consts::timer::MM_TIME4 => self.timer4,
            consts::timer::MM_TIME5 => self.timer5,
            consts::timer::MM_TIME6 => self.timer6,
            _ => 0,
        };
        debug!("Reading TIMER: {:o} = {:o}", bank_offset, res);
        res
    }

    fn write(&mut self, _bank_idx: usize, bank_offset: usize, value: u16) {
        debug!(
            "Timers: Setting {:x} to bank_offet: {:o}",
            value, bank_offset
        );
        match bank_offset {
            consts::timer::MM_TIME2 => {
                self.set_time_value(TimerType::TIME1, value);
            }
            consts::timer::MM_TIME1 => {
                self.set_time_value(TimerType::TIME1, value);
            }
            consts::timer::MM_TIME3 => {
                self.set_time_value(TimerType::TIME3, value);
            }
            consts::timer::MM_TIME4 => {
                self.set_time_value(TimerType::TIME4, value);
            }
            consts::timer::MM_TIME5 => {
                self.set_time_value(TimerType::TIME5, value);
            }
            consts::timer::MM_TIME6 => {
                self.set_time_value(TimerType::TIME6, value);
            }
            _ => {}
        }
    }
}
